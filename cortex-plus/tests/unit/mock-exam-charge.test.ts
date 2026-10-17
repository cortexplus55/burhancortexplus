import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Yazılı deneme tek ücret, bütün konular (17 Ekim 2026, canlıda bulundu).

  Pediatri'de (16 konu) 10 soruluk kâğıt denemesi "Planlanan 10 sorudan 1'i hazırlandı"
  ile açıldı. Deneme her konu için ayrı öğretmen üretimi başlatıyor ve hepsine aynı
  ödeme anahtarını veriyordu; kredi sistemi anahtarı yalnız ilk işe veriyor, ötekiler
  "işlem sürüyor / bitti" ile boş dönüyordu. Hata 2 Ekim'de deneme öğretmen motoruna
  geçtiğinden beri vardı. Şimdi kredi deneme başında bir kez ayrılır; konu üretimleri o
  ayrılışı kullanır, en az bir soru çıkarsa kesinleşir, çıkmazsa iade edilir.
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

const quiz = vi.hoisted(() => ({ fail: false, calls: [] as Array<{ topicLabel?: string; held?: string }> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => credits);
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, OPENAI_API_KEY: "k", OPENAI_CONTENT_MODEL: "luna-test" } };
});
// Model boş döner: motor soru çıkaramaz, kredi yolu (iade / iadesiz) görünür.
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: async () => ({ choices: [{ message: { content: "{}" } }], usage: {} }) } };
  },
}));
vi.mock("@/lib/learning/source-context", () => ({
  loadTopicSpanContext: async (_s: unknown, _u: string, _d: string[], label: string) => ({
    block: `[s. 3] Pediatri: ${label} konusunun kaynak metni, ayırıcı bulgular ve yaklaşım.`,
    documentName: "Pediatri.pdf",
  }),
  loadMergedTopicContext: async () => ({ block: "", documentName: null }),
}));
vi.mock("@/lib/learning/question-verifier", () => ({
  verifyChoiceQuestion: (question: unknown) => ({ status: "keep", question }),
}));
// Öğretmen test motorunun kredi davranışı: ayrılış verilmezse anahtarla kendisi ayırır.
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async (input: {
    service: unknown;
    userId: string;
    idempotencyKey?: string;
    heldReservationId?: string;
    count?: number;
    topicLabel?: string;
  }) => {
    quiz.calls.push({ topicLabel: input.topicLabel, held: input.heldReservationId });
    if (!input.heldReservationId) {
      const claim = await credits.reserveCredits(input.service, input.userId, "PRACTICE_EXAM_GENERATE", input.idempotencyKey ?? "");
      if (!claim.ok) return { ok: false, status: 409, error: claim.reason };
    }
    if (quiz.fail) return { ok: false, status: 503, error: "generation_failed" };
    const count = input.count ?? 1;
    // Deneme benzer soruları eler; her konunun sorusu kendi sözcükleriyle yazılır.
    const words = `${input.topicLabel} ${input.topicLabel?.split("").reverse().join("")} vaka${quiz.calls.length}`;
    return {
      ok: true,
      questions: Array.from({ length: count }, (_, i) => ({
        text: `${words} soru${i}${quiz.calls.length}?`,
        options: [`${input.topicLabel} A`, `${input.topicLabel} B`, `${input.topicLabel} C`, `${input.topicLabel} D`],
        correct: [`${input.topicLabel} ${"ABCD"[i % 4]}`],
        multi: false,
        explanation: "Kaynaktaki ayırıcı bulgu bu şıkkı gösterir.",
        optionWhy: ["a", "b", "c", "d"],
      })),
    };
  },
}));

import { createMockExam } from "@/lib/learning/mock-exam/create";
import { runTeacherQuiz } from "@/lib/learning/teacher-quiz-run";

const TOPICS = [
  "Büyüme ve Gelişme", "Yenidoğan", "Beslenme", "Solunum", "Gastroenteroloji", "Enfeksiyon",
  "Hematoloji", "Nefroloji", "Kardiyoloji", "Nöroloji", "Endokrin", "Metabolizma",
  "İmmünoloji", "Romatoloji", "Genetik", "Acil",
].map((label, i) => ({ id: `t${i}`, label, status: "ready", source_refs: [] }));

/** Zincirlenebilen sahte Supabase istemcisi; eklenen satırları tutar. */
function fakeService() {
  const inserted: Record<string, unknown[]> = {};
  const tables: Record<string, unknown> = {
    exam_preps: { id: "p1", title: "Çocuk Sağlığı ve Hastalıkları", exam_type: "", user_id: "u1", document_id: "d1" },
    exam_prep_topics: TOPICS,
    exam_prep_source_documents: [],
    document_pages: [],
    practice_exams: { id: "e1" },
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
    expect(new Set(quiz.calls.map((call) => call.topicLabel)).size).toBe(allocated);
    expect(allocated).toBeGreaterThan(1);

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
