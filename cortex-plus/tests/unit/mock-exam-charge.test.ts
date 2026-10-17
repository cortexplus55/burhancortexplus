import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Yazılı deneme tek ücret, bütün konular (17 Ekim 2026, canlıda bulundu).

  Pediatri'de (16 konu) 10 soruluk kâğıt denemesi "Planlanan 10 sorudan 1'i hazırlandı"
  ile açıldı. Deneme her konu için ayrı öğretmen üretimi başlatıyor ve hepsine aynı
  ödeme anahtarını veriyordu; kredi sistemi anahtarı yalnız ilk işe veriyor, ötekiler
  "işlem sürüyor / bitti" ile boş dönüyordu. Hata 2 Ekim'de deneme öğretmen motoruna
  geçtiğinden beri vardı. Şimdi kredi deneme başında bir kez ayrılır; konu üretimleri o
  ayrılışı kullanır, en az bir soru çıkarsa kesinleşir, çıkmazsa iade edilir.

  Aynı denemede 10 sorunun 4'ü bozuktu: kod çoktan seçmeli soruyu şıklarını silip
  doğru/yanlış ("hangi grupta sınıflanır?" + Doğru/Yanlış), sayısal ve açık uçlu yapıyordu.
  Karar (ürün sahibi, Astra gibi): çoktan seçmeli + açık uçlu; açık uçlu sözlü öğretmen
  motorundan, cevabı yapay zekâ ölçüt başına alıntıyla notlar.
*/

const credits = vi.hoisted(() => {
  const claimed = new Set<string>();
  return {
    claimed,
    reserveCredits: vi.fn(async (_service: unknown, _user: string, _action: string, key: string) => {
      // Gerçek credit_claim_operation gibi: aynı anahtar ikinci kez "busy".
      if (claimed.has(key)) return { ok: false as const, reason: "operation_in_progress" as const };
      claimed.add(key);
      return { ok: true as const, reservationId: `res:${key}`, cost: 15 };
    }),
    commitCredits: vi.fn(async () => undefined),
    refundCredits: vi.fn(async () => undefined),
    recordUsage: vi.fn(async () => undefined),
  };
});

const quiz = vi.hoisted(() => ({
  fail: false,
  /** İlk denemede boş dönen konular (canlıda Nefroloji). */
  failOnce: new Set<string>(),
  calls: [] as Array<{ topicLabel?: string; held?: string; multi?: boolean }>,
  oral: [] as Array<{ topicLabel: string; count: number }>,
}));
/** Modelin cevabı; varsayılan "{}" (motor soru çıkaramaz, kredi yolu görünür). */
const ai = vi.hoisted(() => ({ reply: "{}", calls: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => credits);
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, OPENAI_API_KEY: "k", OPENAI_CONTENT_MODEL: "luna-test" } };
});
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => {
          ai.calls += 1;
          return { choices: [{ message: { content: ai.reply } }], usage: {} };
        },
      },
    };
  },
}));
vi.mock("@/lib/learning/mistake-notebook", () => ({ recordMistakes: async () => undefined }));
vi.mock("@/lib/learning/missed-day-reschedule", () => ({ maybeRescheduleMissedDays: async () => undefined }));
vi.mock("@/lib/streak/record-activity", () => ({ recordUserActivity: async () => undefined }));
// Öğretmen sözlü motoru: denetlenmiş açık uçlu soru, beklenen noktalar ve örnek cevap.
vi.mock("@/lib/learning/teacher-practice", () => ({
  teacherOralLoop: async (_ask: unknown, input: { topicLabel: string; count: number }) => {
    quiz.oral.push({ topicLabel: input.topicLabel, count: input.count });
    if (quiz.fail) return { items: [], rejected: [], rounds: 0 };
    return {
      items: Array.from({ length: input.count }, (_, i) => ({
        prompt: `${input.topicLabel} ${input.topicLabel.split("").reverse().join("")} açıkla ${i}`,
        rubricCriteria: [],
        expectedPoints: ["Yaş ve genel görünüm belirleyicidir", "Ateş derecesi tek başına yetmez", "Alarm bulguları acildir"],
        modelAnswer: "Yaş, genel görünüm ve alarm bulguları ateş derecesinden daha belirleyicidir.",
      })),
      rejected: [],
      rounds: 0,
    };
  },
}));
vi.mock("@/lib/learning/source-context", () => ({
  loadTopicSpanContext: async (_s: unknown, _u: string, _d: string[], label: string) => ({
    block: `[s. 3] Pediatri: ${label} konusunun kaynak metni, ayırıcı bulgular ve yaklaşım.`,
    documentName: "Pediatri.pdf",
  }),
  loadMergedTopicContext: async () => ({ block: "", documentName: null }),
}));
// Öğretmen test motorunun kredi davranışı: ayrılış verilmezse anahtarla kendisi ayırır.
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async (input: {
    service: unknown;
    userId: string;
    idempotencyKey?: string;
    heldReservationId?: string;
    count?: number;
    multi?: boolean;
    topicLabel?: string;
  }) => {
    quiz.calls.push({ topicLabel: input.topicLabel, held: input.heldReservationId, multi: input.multi });
    if (!input.heldReservationId) {
      const claim = await credits.reserveCredits(input.service, input.userId, "PRACTICE_EXAM_GENERATE", input.idempotencyKey ?? "");
      if (!claim.ok) return { ok: false, status: 409, error: claim.reason };
    }
    if (quiz.fail) return { ok: false, status: 503, error: "generation_failed" };
    if (input.topicLabel && quiz.failOnce.delete(input.topicLabel)) return { ok: false, status: 503, error: "generation_failed" };
    const count = input.count ?? 1;
    // Deneme benzer soruları eler; her konunun sorusu kendi sözcükleriyle yazılır.
    const words = `${input.topicLabel} ${input.topicLabel?.split("").reverse().join("")} vaka${quiz.calls.length}`;
    return {
      ok: true,
      questions: Array.from({ length: count }, (_, i) => ({
        text: `${words} soru${i}${quiz.calls.length}?`,
        options: [`${input.topicLabel} A`, `${input.topicLabel} B`, `${input.topicLabel} C`, `${input.topicLabel} D`],
        // Çok cevaplı yer bu konudaysa öğretmen son soruyu "hangileri" yazar (iki doğru).
        correct:
          input.multi && i === count - 1
            ? [`${input.topicLabel} A`, `${input.topicLabel} C`]
            : [`${input.topicLabel} ${"ABCD"[i % 4]}`],
        multi: Boolean(input.multi && i === count - 1),
        explanation: "Kaynaktaki ayırıcı bulgu bu şıkkı gösterir.",
        optionWhy: ["a", "b", "c", "d"],
      })),
    };
  },
}));

import { defaultSlots } from "@/lib/learning/mock-exam/blueprint";
import { createMockExam } from "@/lib/learning/mock-exam/create";
import { gradeMockExam } from "@/lib/learning/mock-exam/grade-exam";
import { parseOpenGrade } from "@/lib/learning/mock-exam/open-grade";
import { runTeacherQuiz } from "@/lib/learning/teacher-quiz-run";

const TOPICS = [
  "Büyüme ve Gelişme", "Yenidoğan", "Beslenme", "Solunum", "Gastroenteroloji", "Enfeksiyon",
  "Hematoloji", "Nefroloji", "Kardiyoloji", "Nöroloji", "Endokrin", "Metabolizma",
  "İmmünoloji", "Romatoloji", "Genetik", "Acil",
].map((label, i) => ({ id: `t${i}`, label, status: "ready", source_refs: [] }));

/** Zincirlenebilen sahte Supabase istemcisi; eklenen satırları tutar. */
function fakeService(extra: Record<string, unknown> = {}) {
  const inserted: Record<string, unknown[]> = {};
  const tables: Record<string, unknown> = {
    exam_preps: { id: "p1", title: "Çocuk Sağlığı ve Hastalıkları", exam_type: "", user_id: "u1", document_id: "d1" },
    exam_prep_topics: TOPICS,
    exam_prep_source_documents: [],
    document_pages: [],
    practice_exams: { id: "e1" },
    ...extra,
  };
  return {
    inserted,
    from(table: string) {
      const result = { data: tables[table] ?? null, error: null };
      const chain: Record<string | symbol, unknown> = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
            if (prop === "insert") {
              return (rows: unknown) => {
                (inserted[table] ??= []).push(rows);
                return chain;
              };
            }
            if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(result);
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
}

beforeEach(() => {
  credits.claimed.clear();
  credits.reserveCredits.mockClear();
  credits.commitCredits.mockClear();
  credits.refundCredits.mockClear();
  credits.recordUsage.mockClear();
  quiz.fail = false;
  quiz.calls = [];
  quiz.oral = [];
  quiz.failOnce = new Set();
  ai.reply = "{}";
  ai.calls = 0;
});

describe("yazılı deneme: tek ücret, bütün konular", () => {
  it("16 konulu hazırlıkta kısa deneme planlanan bütün sorularla çıkar; kredi bir kez ayrılır ve kesinleşir", async () => {
    const service = fakeService();
    const result = await createMockExam({ service: service as never, userId: "u1", isPremium: true, prepId: "p1", preset: "short" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.planned).toBeGreaterThanOrEqual(10);
    expect(result.ready).toBe(result.planned);
    expect(result.note).toBeNull();
    const allocated = result.blueprint.allocation.filter((row) => row.count > 0).length;
    const topicsAsked = new Set([...quiz.calls.map((call) => call.topicLabel), ...quiz.oral.map((call) => call.topicLabel)]);
    expect(topicsAsked.size).toBe(allocated);
    expect(allocated).toBeGreaterThan(1);

    // Çoktan seçmeli + açık uçlu; açık uçlu sözlü motorundan, beklenen noktalar rubrik olur.
    const saved = service.inserted.practice_exam_questions?.[0] as Array<{ question_type: string; options: unknown; rubric: Array<{ criterion: string; points: number }> | null; model_answer: string | null; points: number }>;
    // Öğretmenin çok cevaplı sorusu eski kural süzgecine takılmadan çok cevaplı kalır.
    expect(new Set(saved.map((row) => row.question_type))).toEqual(new Set(["mcq", "multi_mcq", "open"]));
    expect(saved.filter((row) => row.question_type === "multi_mcq")).toHaveLength(1);
    const open = saved.filter((row) => row.question_type === "open");
    expect(open.length).toBe(quiz.oral.reduce((sum, call) => sum + call.count, 0));
    expect(open[0]?.options).toBeNull();
    expect(open[0]?.rubric?.map((row) => row.criterion)).toEqual(["Yaş ve genel görünüm belirleyicidir", "Ateş derecesi tek başına yetmez", "Alarm bulguları acildir"]);
    expect(open[0]?.rubric?.reduce((sum, row) => sum + row.points, 0)).toBe(open[0]?.points);
    expect(open[0]?.model_answer).toContain("alarm bulguları");
    // Çok cevaplı yer hangi konudaysa test motoruna "tam bir çok cevaplı" diye gider.
    expect(quiz.calls.filter((call) => call.multi).length).toBe(1);

    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
    const reservationId = `res:${String(credits.reserveCredits.mock.calls[0]?.[3])}`;
    expect(quiz.calls.every((call) => call.held === reservationId)).toBe(true);
    expect(credits.commitCredits).toHaveBeenCalledTimes(1);
    expect(credits.commitCredits).toHaveBeenCalledWith(service, reservationId);
    expect(credits.refundCredits).not.toHaveBeenCalled();
    expect((service.inserted.practice_exam_questions?.[0] as unknown[]).length).toBe(result.planned);
  });

  it("hiç soru çıkmazsa deneme yazılmaz, kredi iade", async () => {
    quiz.fail = true;
    const service = fakeService();
    const result = await createMockExam({ service: service as never, userId: "u1", isPremium: true, prepId: "p1", preset: "short" });
    expect(result).toEqual({ ok: false, status: 500, error: "generation_failed" });
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(credits.commitCredits).not.toHaveBeenCalled();
    expect(service.inserted.practice_exams).toBeUndefined();
  });

  it("kredi yetmezse 402, hiçbir konu üretilmez", async () => {
    credits.reserveCredits.mockResolvedValueOnce({ ok: false, reason: "insufficient_credits" } as never);
    const result = await createMockExam({ service: fakeService() as never, userId: "u1", isPremium: false, prepId: "p1", preset: "short" });
    expect(result).toEqual({ ok: false, status: 402, error: "insufficient_credits" });
    expect(quiz.calls).toEqual([]);
  });
});

describe("öğretmen test motoru: ayrılmış krediyle çalışma", () => {
  const input = {
    userId: "u1",
    actionCode: "PRACTICE_EXAM_GENERATE" as const,
    idempotencyKey: "practice-exam:p1:u1:1",
    topicLabel: "Enfeksiyon",
    prepTitle: "Pediatri",
    pages: [],
    sourceBlock: "[s. 3] Pediatri: ateşli çocukta yaklaşım.",
    mode: "document" as const,
    count: 2,
    minimum: 1,
  };

  it("ayrılış verilince kendisi ayırmaz, iade etmez; kullanım o ayrılışa yazılır", async () => {
    const out = await runTeacherQuiz({} as never, { ...input, heldReservationId: "res:held" });
    expect(out.ok).toBe(false);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.refundCredits).not.toHaveBeenCalled();
    expect(credits.commitCredits).not.toHaveBeenCalled();
    expect(credits.recordUsage).toHaveBeenCalledWith({}, expect.objectContaining({ reservationId: "res:held" }));
  });

  it("ayrılış yoksa eskisi gibi: kendisi ayırır, soru çıkmazsa iade eder", async () => {
    const out = await runTeacherQuiz({} as never, input);
    expect(out.ok).toBe(false);
    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
  });
});

describe("yazılı deneme: eksik kalan konu", () => {
  it("ilk turda boş dönen konu yeniden denenir; listenin ilk konusu değil", async () => {
    quiz.failOnce = new Set(["Nefroloji"]);
    const service = fakeService();
    const result = await createMockExam({ service: service as never, userId: "u1", isPremium: true, prepId: "p1", preset: "short" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const allocated = result.blueprint.allocation.filter((row) => row.count > 0).map((row) => row.topicLabel);
    expect(allocated).toContain("Nefroloji");
    expect(quiz.calls.filter((call) => call.topicLabel === "Nefroloji")).toHaveLength(2);
    expect(quiz.calls.filter((call) => call.topicLabel === allocated[0])).toHaveLength(1);
    const saved = service.inserted.practice_exam_questions?.[0] as Array<{ topic_label: string }>;
    expect(saved.some((row) => row.topic_label === "Nefroloji")).toBe(true);
    expect(result.ready).toBe(result.planned);
    expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
  });
});

describe("yazılı deneme: Astra gibi çoktan seçmeli + açık uçlu", () => {
  it("varsayılan plan doğru/yanlış ve sayısal yer açmaz; 10 soruda 7 + 1 çok cevaplı + 2 açık uçlu", () => {
    const count = (slots: { type: string }[], type: string) => slots.filter((slot) => slot.type === type).length;
    const ten = defaultSlots(10, true);
    expect([count(ten, "mcq"), count(ten, "multi_mcq"), count(ten, "open")]).toEqual([7, 1, 2]);
    for (const n of [5, 10, 20, 40]) {
      const slots = defaultSlots(n, true);
      expect(slots).toHaveLength(n);
      expect(slots.every((slot) => ["mcq", "multi_mcq", "open"].includes(slot.type))).toBe(true);
    }
  });

  const questions = [
    {
      id: "q1",
      question_text: "Ateşli çocukta aciliyeti neye göre değerlendirirsin?",
      question_type: "open",
      options: null,
      correct_answer: null,
      correct_answers: [],
      points: 10,
      explanation: "Yaş, genel görünüm ve alarm bulguları ateş derecesinden daha belirleyicidir.",
      topic_id: "t5",
      topic_label: "Enfeksiyon",
      rubric: [
        { criterion: "Yaş ve genel görünüm belirleyicidir", points: 5 },
        { criterion: "Ateş derecesi tek başına yetmez", points: 5 },
      ],
      model_answer: "Yaş, genel görünüm ve alarm bulguları ateş derecesinden daha belirleyicidir.",
    },
    {
      id: "q2",
      question_text: "Menenjitte alarm bulgularını say.",
      question_type: "open",
      options: null,
      correct_answer: null,
      correct_answers: [],
      points: 10,
      explanation: "Ense sertliği, bilinç değişikliği, peteşi.",
      topic_id: "t5",
      topic_label: "Enfeksiyon",
      rubric: [
        { criterion: "Ense sertliği", points: 5 },
        { criterion: "Bilinç değişikliği", points: 5 },
      ],
      model_answer: "Ense sertliği, bilinç değişikliği ve peteşi.",
    },
  ];
  const answers = {
    // Ölçütlerin sözcükleri geçmiyor ama ikisini de doğru söylüyor.
    q1: "Bebeğin kaç aylık olduğuna ve ne kadar hasta göründüğüne bakarım; termometredeki sayı tek başına karar verdirmez.",
    q2: "Ateş ve öksürük olur.",
  };
  const grade = async () => {
    const service = fakeService({
      practice_exams: { id: "e1", title: "Pediatri", user_id: "u1", deadline_at: null, blueprint: null },
      practice_exam_questions: questions,
      practice_exam_attempts: { id: "a1" },
    });
    const result = await gradeMockExam({ service: service as never, userId: "u1", examId: "e1", answers });
    const reviews = service.inserted.practice_exam_item_reviews?.[0] as Array<{ question_id: string; verdict: string; points_earned: number }>;
    return { result, reviews: Object.fromEntries(reviews.map((row) => [row.question_id, row])) };
  };

  it("açık uçlu cevabı yapay zekâ ölçüt başına alıntıyla notlar; sözcükleri farklı doğru cevap tam puan alır", async () => {
    ai.reply = JSON.stringify({
      items: [
        {
          index: 0,
          criteria: [
            { index: 0, met: true, quote: "kaç aylık olduğuna ve ne kadar hasta göründüğüne bakarım" },
            { index: 1, met: true, quote: "termometredeki sayı tek başına karar verdirmez" },
          ],
        },
        // Uydurma alıntı: cevapta yok, puan getirmez.
        { index: 1, criteria: [{ index: 0, met: true, quote: "ense sertliği olur" }, { index: 1, met: false, quote: "" }] },
      ],
    });
    const { result, reviews } = await grade();
    expect(result.ok).toBe(true);
    expect(ai.calls).toBe(1);
    expect(reviews.q1).toMatchObject({ verdict: "dogru", points_earned: 10 });
    expect(reviews.q2).toMatchObject({ verdict: "yanlis", points_earned: 0 });
    expect(credits.recordUsage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actionCode: "PRACTICE_EXAM_GRADE" }));
  });

  it("yarısını karşılayan cevap kısmen; model düşerse not yine çıkar (eski yerel yöntem)", async () => {
    ai.reply = JSON.stringify({
      items: [{ index: 0, criteria: [{ index: 0, met: true, quote: "ne kadar hasta göründüğüne bakarım" }, { index: 1, met: false }] }],
    });
    const partial = await grade();
    expect(partial.reviews.q1).toMatchObject({ verdict: "kismen", points_earned: 5 });

    ai.reply = "bozuk";
    const fallback = await grade();
    expect(fallback.result.ok).toBe(true);
    expect(fallback.reviews.q1?.verdict).toBeDefined();
  });

  it("ayrıştırıcı: bilinmeyen soru ve ölçüt dizini, alıntısız 'met' düşer", () => {
    const items = [{ question: "S", criteria: ["A", "B"], modelAnswer: "", answer: "cevap" }];
    const parsed = parseOpenGrade(
      { items: [{ index: 0, criteria: [{ index: 0, met: true, quote: "cevap" }, { index: 5, met: true, quote: "x" }, { index: 1, met: true, quote: "" }] }, { index: 3, criteria: [] }] },
      items,
    );
    expect([...parsed.keys()]).toEqual([0]);
    expect(parsed.get(0)?.quotes).toEqual([{ criterion: "A", quote: "cevap" }]);
  });
});
