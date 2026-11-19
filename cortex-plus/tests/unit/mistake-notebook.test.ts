import { describe, expect, it, vi } from "vitest";
import {
  MASTERY_STREAK,
  nextReviewState,
  toClientGroups,
  type MistakeEntry,
  type MistakeTopicGroup,
} from "@/lib/learning/mistake-notebook";

const NOW = "2026-09-05T12:00:00.000Z";

function state(correctStreak: number, reviewCount = 0, wrongCount = 1) {
  return { correctStreak, reviewCount, wrongCount };
}

describe("yanlış defteri — tekrar kuralı", () => {
  it("tek doğru soruyu defterden çıkarmaz", () => {
    // Dört şıkta bir isabet dörtte bir; tek doğru bilgi kanıtı değil.
    const next = nextReviewState(state(0), true, NOW);
    expect(next.correctStreak).toBe(1);
    expect(next.masteredAt).toBeNull();
  });

  it("üst üste iki doğru soruyu defterden çıkarır", () => {
    const first = nextReviewState(state(0), true, NOW);
    const second = nextReviewState(
      state(first.correctStreak, first.reviewCount, first.wrongCount),
      true,
      NOW,
    );
    expect(second.correctStreak).toBe(MASTERY_STREAK);
    expect(second.masteredAt).toBe(NOW);
  });

  it("araya giren yanlış seriyi sıfırlar", () => {
    const afterOneCorrect = nextReviewState(state(1), false, NOW);
    expect(afterOneCorrect.correctStreak).toBe(0);
    expect(afterOneCorrect.masteredAt).toBeNull();
  });

  it("Doğru → Yanlış → Doğru dizisinde son doğru yalnızca 1 sayılır", () => {
    let s = nextReviewState(state(0), true, NOW);
    expect(s.correctStreak).toBe(1);
    s = nextReviewState(s, false, NOW);
    expect(s.correctStreak).toBe(0);
    s = nextReviewState(s, true, NOW);
    expect(s.correctStreak).toBe(1);
    expect(s.masteredAt).toBeNull();
    // Bir doğru daha → defterden çıkar.
    s = nextReviewState(s, true, NOW);
    expect(s.correctStreak).toBe(MASTERY_STREAK);
    expect(s.masteredAt).toBe(NOW);
  });

  it("yanlış yanıt yanlış sayacını artırır, doğru yanıt artırmaz", () => {
    expect(nextReviewState(state(0, 0, 3), false, NOW).wrongCount).toBe(4);
    expect(nextReviewState(state(0, 0, 3), true, NOW).wrongCount).toBe(3);
  });

  it("her yanıt tekrar sayacını artırır", () => {
    expect(nextReviewState(state(0, 7), true, NOW).reviewCount).toBe(8);
    expect(nextReviewState(state(0, 7), false, NOW).reviewCount).toBe(8);
  });

  it("aşılmış soru yeniden yanlış yapılırsa deftere geri döner", () => {
    // mastered_at dolu bir satırda yanlış yanıt → seri sıfır, mastered null.
    const next = nextReviewState(state(MASTERY_STREAK), false, NOW);
    expect(next.masteredAt).toBeNull();
  });
});

describe("yanlış defteri — istemciye giden paket", () => {
  const entry: MistakeEntry = {
    id: "e1",
    source: "deneme",
    topicLabel: "Üslü sayılar",
    questionText: "2^3 kaçtır?",
    options: ["6", "8", "9"],
    correctAnswer: "8",
    firstWrongAnswer: "6",
    explanation: "Doğru yanıt: 8",
    wrongCount: 2,
    reviewCount: 1,
    correctStreak: 0,
    masteredAt: null,
  };

  const groups: MistakeTopicGroup[] = [
    { label: "Üslü sayılar", entries: [entry] },
  ];

  it("doğru yanıtı ve açıklamayı istemciye göndermez", () => {
    // Bu testin tek işi şu: sayfanın kaynağına bakan öğrenci cevabı
    // okuyamasın. Sızarsa defter neyi bilmediğini değil, neyi kopyaladığını
    // ölçmeye başlar.
    const serialised = JSON.stringify(toClientGroups(groups));
    expect(serialised).not.toContain("Doğru yanıt");
    expect(serialised).not.toContain('"correctAnswer"');
    expect(serialised).not.toContain('"explanation"');
  });

  it("soruyu göstermek için gereken alanları taşır", () => {
    const [group] = toClientGroups(groups);
    expect(group.label).toBe("Üslü sayılar");
    expect(group.questions[0]).toMatchObject({
      id: "e1",
      questionText: "2^3 kaçtır?",
      options: ["6", "8", "9"],
      wrongCount: 2,
    });
  });
});

describe("yanlış defteri — yazım kimliği (Faz 2 madde 3, 22P02)", () => {
  type Call = { op: string; table: string; payload?: unknown; filters: [string, string, unknown][] };

  /** Sahte Supabase: yazılanları tutar; UUID sütununa UUID olmayan değer gelirse Postgres gibi 22P02 döner. */
  function fakeService(options: { existing?: Record<string, unknown>[]; failInsert?: { code: string; message: string } } = {}) {
    const calls: Call[] = [];
    const rows: Record<string, unknown>[] = [...(options.existing ?? [])];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const builder = (table: string) => {
      const call: Call = { op: "select", table, filters: [] };
      const run = async () => {
        calls.push(call);
        if (call.op === "insert") {
          const list = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Record<string, unknown>[];
          if (options.failInsert) return { data: null, error: options.failInsert };
          for (const row of list) {
            const id = row.source_question_id;
            if (id != null && !uuid.test(String(id))) {
              return { data: null, error: { code: "22P02", message: `invalid input syntax for type uuid: "${String(id)}"` } };
            }
          }
          rows.push(...list.map((row, index) => ({ id: `row-${rows.length + index}`, wrong_count: 1, ...row })));
          return { data: null, error: null };
        }
        if (call.op === "update") return { data: null, error: null };
        const match = rows.filter((row) =>
          call.filters.every(([kind, column, value]) =>
            kind === "eq" ? row[column] === value : kind === "in" ? (value as unknown[]).includes(row[column]) : true,
          ),
        );
        return { data: match, error: null };
      };
      const chain = {
        select: () => chain,
        insert: (payload: unknown) => {
          call.op = "insert";
          call.payload = payload;
          return chain;
        },
        update: (payload: unknown) => {
          call.op = "update";
          call.payload = payload;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push(["eq", column, value]);
          return chain;
        },
        in: (column: string, value: unknown[]) => {
          call.filters.push(["in", column, value]);
          return chain;
        },
        maybeSingle: async () => {
          const result = await run();
          return { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run().then(resolve, reject),
      };
      return chain;
    };
    return { service: { from: (table: string) => builder(table) } as never, calls, rows };
  }

  const USER = "00000000-0000-4000-8000-000000000001";
  const attemptId = "00000000-0000-4000-8000-0000000000a1";
  const denemeQuestionId = "3f2b8c1e-5d4a-4b7e-9c2d-1a2b3c4d5e6f";

  const draft = (source: "deneme" | "quiz" | "true_false", sourceQuestionId: string) => ({
    source,
    sourceQuestionId,
    topicLabel: null,
    questionText: "Soru",
    options: ["A", "B"],
    correctAnswer: "A",
    wrongAnswer: "B",
    explanation: null,
  });

  it("gerçek UUID deneme sorusu source_question_id'ye, yol kimlikleri source_ref'e yazılır", async () => {
    const { recordMistakes } = await import("@/lib/learning/mistake-notebook");
    const fake = fakeService();
    const result = await recordMistakes(fake.service, USER, [
      draft("deneme", denemeQuestionId),
      draft("quiz", `${attemptId}:q:0`),
      draft("true_false", `${attemptId}:tf:1`),
    ]);
    expect(result).toEqual({ ok: true, savedCount: 3, error: null });
    const byKey = Object.fromEntries(fake.rows.map((row) => [String(row.source), row]));
    expect(byKey.deneme).toMatchObject({ source_question_id: denemeQuestionId, source_ref: null });
    expect(byKey.quiz).toMatchObject({ source_question_id: null, source_ref: `${attemptId}:q:0` });
    expect(byKey.true_false).toMatchObject({ source_question_id: null, source_ref: `${attemptId}:tf:1` });
  });

  it("aynı soru yeniden yanlış yapılınca yeni satır açılmaz, sayaç artar (UUID ve yol kimliği)", async () => {
    const { recordMistakes } = await import("@/lib/learning/mistake-notebook");
    const fake = fakeService({
      existing: [
        { id: "e-deneme", user_id: USER, source: "deneme", source_question_id: denemeQuestionId, source_ref: null, wrong_count: 1 },
        { id: "e-quiz", user_id: USER, source: "quiz", source_question_id: null, source_ref: `${attemptId}:q:0`, wrong_count: 2 },
      ],
    });
    const result = await recordMistakes(fake.service, USER, [draft("deneme", denemeQuestionId), draft("quiz", `${attemptId}:q:0`)]);
    expect(result).toEqual({ ok: true, savedCount: 2, error: null });
    expect(fake.calls.filter((call) => call.op === "insert")).toHaveLength(0);
    const updates = fake.calls.filter((call) => call.op === "update");
    expect(updates.map((call) => call.payload)).toEqual([
      { wrong_count: 2, correct_streak: 0, mastered_at: null },
      { wrong_count: 3, correct_streak: 0, mastered_at: null },
    ]);
  });

  it("yazım hatası yutulmaz: yapılandırılmış günlük + { ok: false, savedCount, error }", async () => {
    const { recordMistakes } = await import("@/lib/learning/mistake-notebook");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = fakeService({ failInsert: { code: "42501", message: "permission denied" } });
    const result = await recordMistakes(fake.service, USER, [draft("quiz", `${attemptId}:q:0`)]);
    expect(result).toEqual({ ok: false, savedCount: 0, error: "permission denied" });
    expect(error).toHaveBeenCalledWith(
      "mistake_notebook_write_failed",
      expect.objectContaining({ step: "insert", code: "42501", message: "permission denied" }),
    );
    error.mockRestore();
  });

  it("yol kimliği artık UUID sütununa gitmez (eski 22P02 yolu kapalı)", async () => {
    const { mistakeIdentity, isUuid } = await import("@/lib/learning/mistake-notebook");
    expect(isUuid(denemeQuestionId)).toBe(true);
    for (const kind of ["q", "tf", "pc", "lc"]) {
      const id = `${attemptId}:${kind}:0`;
      expect(isUuid(id)).toBe(false);
      expect(mistakeIdentity({ sourceQuestionId: id })).toEqual({ source_question_id: null, source_ref: id });
    }
    expect(mistakeIdentity({ sourceQuestionId: denemeQuestionId })).toEqual({ source_question_id: denemeQuestionId, source_ref: null });
  });

  it("yol etkinliği taslakları türüne göre kaynak taşır (quiz, true_false)", async () => {
    const { mistakeDraftsFromAttempt } = await import("@/lib/learning/node/score");
    const tf = mistakeDraftsFromAttempt(
      attemptId,
      { type: "true_false", items: [{ statement: "Önerme bir", correct: true }, { statement: "Önerme iki", correct: false }] },
      { "0": true, "1": "true" },
      null,
    );
    expect(tf).toEqual([expect.objectContaining({ source: "true_false", sourceQuestionId: `${attemptId}:tf:1` })]);
  });
});
