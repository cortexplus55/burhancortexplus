import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  19 Ekim 2026, ürün sahibi: "oluşturulamadı gibi uyarılar olmasın". Test motorunda yetersiz soru
  (asgari count−2, en az 3) doğrudan `generation_failed` oluyordu. Şimdi ikinci taslak yazılır,
  yeni sorular eklenir; iki geçişten sonra bile iki sorunun altındaysa test yok.
*/
const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(async () => ({ ok: true, reservationId: "res-1", cost: 4 })),
  commitCredits: vi.fn(async () => undefined),
  refundCredits: vi.fn(async () => undefined),
  recordUsage: vi.fn(async () => undefined),
}));
/** Her taslak çağrısında modelin döndüreceği soru sayısı (sırayla). */
const ai = vi.hoisted(() => ({ drafts: 0, verifies: 0, draftSizes: [] as number[] }));

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
        create: async (params: { messages: { role: string; content: string }[] }) => {
          const system = params.messages[0]?.content ?? "";
          let content: string;
          if (system.includes("denetçisisin")) {
            ai.verifies += 1;
            content = JSON.stringify({ issues: [] });
          } else {
            const size = ai.draftSizes[ai.drafts] ?? 0;
            ai.drafts += 1;
            content = JSON.stringify({
              questions: Array.from({ length: size }, (_, i) => ({
                text: `Taslak ${ai.drafts}, soru ${i}: kurucu unsuru eksik işlem hangi durumdadır?`,
                options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Tek taraflı bağlamazlık"],
                correct: "Yokluk",
                multi: false,
                explanation: "Kurucu unsur eksikse işlem hiç doğmamıştır; diğerlerinde işlem doğmuştur.",
                optionWhy: [
                  "Kurucu unsur eksik olduğu için işlem hiç doğmamıştır.",
                  "Mutlak butlanda işlem doğmuş ama kesin geçersizdir.",
                  "Nispi butlan irade sakatlığında iptal hakkı verir.",
                  "Tek taraflı bağlamazlıkta işlem onaya kadar askıdadır.",
                ],
                misconceptionTag: "yokluk-butlan karışıklığı",
                learningObjective: "Kurucu unsur eksikliğini yoklukla eşleştirir.",
              })),
            });
          }
          return { choices: [{ message: { content } }], usage: {} };
        },
      },
    };
  },
}));

const { runTeacherQuiz } = await import("@/lib/learning/teacher-quiz-run");

const input = {
  userId: "u1",
  actionCode: "QUIZ_GENERATE" as const,
  idempotencyKey: "k1",
  topicLabel: "Hükümsüzlük",
  prepTitle: "KPSS",
  pages: [{ page: 8, text: "Yokluk: kurucu unsur eksikse işlem hiç doğmamıştır." }],
  count: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  ai.drafts = 0;
  ai.verifies = 0;
});

describe("test motoru: yetersiz soru ikinci taslak demek", () => {
  it("ilk taslak 1 soru verirse ikinci taslak eklenir; test 4 soruyla açılır, kredi bir kez kesinleşir", async () => {
    ai.draftSizes = [1, 3];
    const out = await runTeacherQuiz({} as never, input);
    expect(out.ok && out.questions.length).toBe(4);
    expect(ai.drafts).toBe(2);
    expect(credits.commitCredits).toHaveBeenCalledTimes(1);
    expect(credits.refundCredits).not.toHaveBeenCalled();
  });

  it("iki geçişten sonra bile iki sorunun altındaysa test yok, kredi iade", async () => {
    ai.draftSizes = [1, 0];
    const out = await runTeacherQuiz({} as never, input);
    expect(out.ok).toBe(false);
    expect(ai.drafts).toBeGreaterThanOrEqual(2);
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
  });

  it("yeterli soru çıkarsa ikinci taslak yazılmaz", async () => {
    ai.draftSizes = [5];
    const out = await runTeacherQuiz({} as never, input);
    expect(out.ok && out.questions.length).toBe(5);
    expect(ai.drafts).toBe(1);
  });
});
