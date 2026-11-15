/**
 * H2 gölge mod (Burhan kararı 2, 15 Kasım 2026): `quiz.option_check` açıkken elenecek sorular yalnız SAYILIR, soru
 * elenmez. Eleme ancak `quiz.option_check_enforce` de açıkken. Test motoru sahte modelle çalışır (model çağrısı yok).
 * Örnekler farklı derslerden.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { teacherQuizLoop } = await import("@/lib/learning/teacher-quiz-run");

const why = (options: string[]) => options.map((option) => `${option} için kısa ve kendine özgü bir gerekçe.`);
const raw = (text: string, options: string[], correct: string) => ({
  text,
  options,
  correct,
  multi: false,
  explanation: "Doğru cevabın nedeni ve öbür şıkların gerçekte neye karşılık geldiği kısaca anlatılır.",
  optionWhy: why(options),
  misconceptionTag: "kavram karışıklığı",
  learningObjective: "Kavramı ayırt eder.",
});

/** G8 biçimi (fizik): C şıkkı "ne … ne de" + olumsuz fiil. */
const G8 = raw(
  "Enerjinin korunumu ilkesine göre hangisi doğrudur?",
  [
    "Enerji hem yoktan var edilebilir hem de yok edilebilir.",
    "Enerji yoktan var edilemez, ancak var olan enerji yok edilebilir.",
    "Enerji ne yoktan var edilebilir ne de yok edilemez.",
    "Enerji yoktan var edilebilir, ancak var olan enerji yok edilemez.",
    "Enerji yoktan var edilemez ve var olan enerji yok edilemez.",
  ],
  "Enerji yoktan var edilemez ve var olan enerji yok edilemez.",
);
/** Tarih: aynı öğeler yalnız başka sırayla. */
const REORDERED = raw(
  "Çaldıran Savaşı'nın tarafları hangileridir?",
  ["Osmanlı ve Safevi", "Safevi ile Osmanlı", "Memlük ve Safevi", "Osmanlı ve Memlük", "Bizans ve Safevi"],
  "Osmanlı ve Safevi",
);
/** Biyoloji: temiz soru. */
const CLEAN = raw(
  "Hücrede protein sentezi hangi yapıda gerçekleşir?",
  ["Ribozom", "Lizozom", "Golgi aygıtı", "Koful", "Sentrozom"],
  "Ribozom",
);

const input = {
  topicLabel: "Karma",
  prepTitle: "Deneme",
  pages: [{ page: 1, text: "Enerji yoktan var edilemez, var olan yok edilemez. Ribozom protein sentezler. Çaldıran: Osmanlı ve Safevi." }],
  count: 3,
  optionCount: 5 as const,
  sanity: false,
};

function fakeAsk() {
  return vi.fn(async (system: string) => {
    if (system.includes("anahtarı görmeden")) return { solved: [] };
    if (system.includes("denetçisisin")) return { issues: [] };
    if (system.startsWith("Sen aynı testi yazan")) return { questions: [] };
    return { questions: [G8, REORDERED, CLEAN] };
  });
}

describe("gölge mod: sayar, elemez", () => {
  it("bayrak kapalı: sayım yok, üç soru da geçer (bugünkü kapı)", async () => {
    const loop = await teacherQuizLoop(fakeAsk(), input);
    expect(loop.questions).toHaveLength(3);
    expect(loop.optionChecked ?? 0).toBe(0);
    expect(loop.optionFlagged ?? 0).toBe(0);
  });

  it("gölge mod: iki soru takılır ama elenmez; kurala göre sayılır", async () => {
    const loop = await teacherQuizLoop(fakeAsk(), { ...input, optionCheck: true });
    expect(loop.questions).toHaveLength(3);
    expect(loop.optionChecked).toBe(3);
    expect(loop.optionFlagged).toBe(2);
    expect(loop.optionKinds).toEqual({ reordered: 1, neitherNor: 1 });
  });

  it("eleme modu yalnız gölge modla birlikte: takılan iki soru elenir, temiz soru kalır", async () => {
    const enforceAlone = await teacherQuizLoop(fakeAsk(), { ...input, optionCheckEnforce: true });
    expect(enforceAlone.questions).toHaveLength(3);
    const loop = await teacherQuizLoop(fakeAsk(), { ...input, optionCheck: true, optionCheckEnforce: true });
    const kept = loop.questions.map((question) => question.text);
    expect(kept).toContain(CLEAN.text);
    expect(kept).not.toContain(G8.text);
    expect(kept).not.toContain(REORDERED.text);
  });

  it("günlük yalnız sayı ve tür taşır, soru metni yazılmaz", () => {
    const run = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    expect(run).toContain('mode: input.optionCheckEnforce ? "enforce" : "shadow"');
    expect(run).toContain("checked: loop.optionChecked");
    expect(run).toContain("isFeatureEnabled(service, QUIZ_OPTION_ENFORCE_FLAG, input.userId)");
  });
});
