import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Faz 1-A §5.4 (19 Kasım 2026): belgeli Kolay / Orta konu testinde vektör / kaynak araması boş dönünce test,
  ünitenin çıkarılmış ders bağlamından (lesson_context) kesintisiz üretilir. Model ve kredi taklit; test motorunun
  kendisi (taslak, yapı kapısı, tek doğru şık kapısı, kredi) gerçek. Örnekler şartnamenin kendi örnekleri.
*/

const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(async () => ({ ok: true, reservationId: "res-1", cost: 4 })),
  commitCredits: vi.fn(async () => undefined),
  refundCredits: vi.fn(async () => undefined),
  recordUsage: vi.fn(async () => undefined),
}));
const ai = vi.hoisted(() => ({ prompts: [] as { system: string; user: string }[] }));
const clean = vi.hoisted(() => ({ ensureCleanPages: vi.fn(async () => [] as { page: number; text: string }[]) }));

const ITEMS = vi.hoisted(() => [
  {
    text: "Bir taş suya tamamen batırılıyor. Taşa etki eden kaldırma kuvveti hangisine bağlıdır?",
    options: ["Sıvının yoğunluğuna", "Taşın rengine", "Kabın biçimine", "Taşın sıcaklığına", "Kabın rengine"],
    correct: "Sıvının yoğunluğuna",
  },
  {
    text: "Aynı cisim önce suya sonra yoğunluğu daha büyük bir sıvıya tamamen batırılıyor. Kaldırma kuvveti nasıl değişir?",
    options: ["Artar", "Azalır", "Değişmez", "Sıfır olur", "Önce artar sonra azalır"],
    correct: "Artar",
  },
  {
    text: "Bir cismin sıvıya batan hacmi 2V'den 4V'ye çıkarılıyor. Kaldırma kuvveti ne olur?",
    options: ["İki katına çıkar", "Yarıya iner", "Değişmez", "Dört katına çıkar", "Sıfır olur"],
    correct: "İki katına çıkar",
  },
  {
    text: "Kaldırma kuvveti bağıntısında yoğunluk terimi hangi maddeye aittir?",
    options: ["Sıvıya", "Cisme", "Kaba", "Havaya", "Zemine"],
    correct: "Sıvıya",
  },
  {
    text: "Bir cisim sıvıda yüzüyorsa kaldırma kuvveti ile cismin ağırlığı arasındaki ilişki nedir?",
    options: ["Eşittir", "Kaldırma kuvveti büyüktür", "Ağırlık büyüktür", "İlişki yoktur", "Kuvvet sıfırdır"],
    correct: "Eşittir",
  },
  {
    text: "Yer çekimi ivmesi azalan bir ortamda aynı cisme etki eden kaldırma kuvveti nasıl değişir?",
    options: ["Azalır", "Artar", "Değişmez", "İki katına çıkar", "Sıfır olur"],
    correct: "Azalır",
  },
]);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/credits/service", () => credits);
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, OPENAI_API_KEY: "k", OPENAI_CONTENT_MODEL: "luna-test" } };
});
vi.mock("@/lib/documents/clean-pages", () => ({
  documentRunningHeaders: vi.fn(async () => []),
  ensureCleanPages: clean.ensureCleanPages,
}));
vi.mock("@/lib/documents/generation-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/documents/generation-context")>();
  return { ...actual, prepTopicLabels: vi.fn(async () => []) };
});
vi.mock("@/lib/learning/previous-items", () => ({ loadPreviousItems: vi.fn(async () => []) }));
vi.mock("@/lib/curriculum/prep-outcome", () => ({ loadOfficialOutcome: vi.fn(async () => null) }));
vi.mock("@/lib/learning/lesson-generation-failures", () => ({ recordLessonGenerationFailure: vi.fn(async () => undefined) }));
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (params: { messages: { role: string; content: string }[] }) => {
          const system = params.messages[0]?.content ?? "";
          const user = params.messages.at(-1)?.content ?? "";
          ai.prompts.push({ system, user });
          let content: string;
          if (system.includes("hızlı bir test editörü")) content = JSON.stringify({ patches: [] });
          else if (system.includes("bağımsız bir çözücüsün")) content = JSON.stringify({ solved: [] });
          else if (system.includes("denetçisisin")) content = JSON.stringify({ issues: [] });
          else {
            content = JSON.stringify({
              questions: ITEMS.map((item) => ({
                ...item,
                multi: false,
                explanation: `${item.correct}: kaldırma kuvveti batan hacim, sıvının yoğunluğu ve yer çekimi ivmesinin çarpımıdır.`,
                optionWhy: item.options.map((option) =>
                  option === item.correct ? `${option} doğru; bağıntı bunu verir.` : `${option} bağıntıda yer almaz.`,
                ),
                misconceptionTag: "cismin yoğunluğu karışıklığı",
                learningObjective: "Kaldırma kuvvetinin bağlı olduğu büyüklükleri ayırt eder.",
              })),
            });
          }
          return { choices: [{ message: { content } }], usage: {} };
        },
      },
    };
  },
}));

const { lessonSourceFallback, sourceFallbackAllowed, SOURCE_FALLBACK_LIMITS } = await import("@/lib/learning/source-fallback");
const { teacherQuizPayload } = await import("@/lib/learning/node/quiz");
const { singleChoiceVerdict } = await import("@/lib/learning/single-choice-guard");
type LessonV2 = import("@/lib/learning/teaching-standards").LessonV2;

const lesson = {
  title: "Kaldırma kuvveti",
  objective: "Kaldırma kuvvetinin bağlı olduğu büyüklükleri ayırt etmek.",
  overview:
    "Sıvıya batan her cisme yukarı doğru bir kuvvet etki eder. Bu kuvvet batan hacim, sıvının yoğunluğu ve yer çekimi ivmesiyle orantılıdır.",
  sections: [
    {
      heading: "Bağıntı",
      body: "Kaldırma kuvveti F = V_batan · d_sıvı · g bağıntısıyla bulunur. Buradaki yoğunluk sıvının yoğunluğudur, cismin yoğunluğu değildir.",
    },
    {
      heading: "Yüzme ve batma",
      body: "Yüzen cisimde kaldırma kuvveti ağırlığa eşittir. Batan cisimde kaldırma kuvveti ağırlıktan küçüktür; cisim dibe iner.",
    },
    {
      heading: "Değişkenler",
      body: "Batan hacim artarsa kuvvet artar. Daha yoğun sıvıda aynı hacim için kuvvet daha büyüktür. Yer çekimi ivmesi azalırsa kuvvet azalır.",
    },
  ],
  commonMistake: { claim: "Kaldırma kuvveti cismin yoğunluğuna bağlıdır.", correction: "Kaldırma kuvveti sıvının yoğunluğuna bağlıdır." },
  summary: ["Kuvvet sıvının yoğunluğuna bağlıdır.", "Yüzen cisimde kuvvet ağırlığa eşittir."],
} as unknown as LessonV2;

beforeEach(() => {
  vi.clearAllMocks();
  ai.prompts.length = 0;
});

describe("kaynak araması yedeği: lesson_context (§3.3, §5.4)", () => {
  it("yalnız belgeli Kolay / Orta konu testi yedeğe düşer; ileri test ve öbür türler düşmez", () => {
    expect(sourceFallbackAllowed("quiz", "kolay")).toBe(true);
    expect(sourceFallbackAllowed("quiz", "orta")).toBe(true);
    expect(sourceFallbackAllowed("quiz", null)).toBe(true);
    expect(sourceFallbackAllowed("quiz", "ileri")).toBe(false);
    expect(sourceFallbackAllowed("lesson", "orta")).toBe(false);
    expect(sourceFallbackAllowed("flashcards", "orta")).toBe(false);
  });

  it("önce dersin çıkarılmış bağlamı (lesson_context), yetmezse ünite özeti (unit_summary), o da yoksa yedek yok", () => {
    const fallback = lessonSourceFallback(lesson)!;
    expect(fallback.kind).toBe("lesson_context");
    expect(fallback.block.length).toBeGreaterThanOrEqual(SOURCE_FALLBACK_LIMITS.lessonMin);
    expect(fallback.block).toContain("F = V_batan · d_sıvı · g");
    const thin = { ...lesson, sections: [], commonMistake: undefined, objective: "" } as unknown as LessonV2;
    expect(lessonSourceFallback(thin)?.kind).toBe("unit_summary");
    expect(lessonSourceFallback({ ...thin, overview: "", summary: [] } as unknown as LessonV2)).toBeNull();
    expect(lessonSourceFallback(null)).toBeNull();
  });

  it("vektör araması boş döndü (çekirdek sayfa yok): test lesson_context'ten başarıyla üretilir", async () => {
    const fallback = lessonSourceFallback(lesson)!;
    const payload = await teacherQuizPayload(
      {
        service: {},
        userId: "u1",
        kind: "quiz",
        prepId: "p1",
        topicId: "t1",
        topicLabel: "Kaldırma kuvveti",
        prepTitle: "Fizik",
        requestedDifficulty: "orta",
        sourceBlock: fallback.block,
        sourceFallback: fallback.kind,
        charge: false,
        idempotencyKey: "k-fallback",
      } as never,
      {} as never,
      // Belge var ama arama konunun hiçbir sayfasını bulamadı.
      { documentId: "d1", pages: [] },
      5,
    );
    expect(payload.type).toBe("quiz");
    expect(payload.questions.length).toBe(5);
    for (const question of payload.questions) expect(singleChoiceVerdict(question).ok).toBe(true);
    // Boş sayfa listesi temizlenmeye gitmez; yazar kaynağı dersin kendisinden okur (belgeli kip, genel bilgi yok).
    expect(clean.ensureCleanPages).not.toHaveBeenCalled();
    const draft = ai.prompts.find((prompt) => prompt.user.includes("KAYNAK:"));
    expect(draft?.user).toContain(fallback.block.slice(0, 120));
    expect(draft?.user).not.toContain("Belgesiz test");
    expect(credits.refundCredits).not.toHaveBeenCalled();
  });
});
