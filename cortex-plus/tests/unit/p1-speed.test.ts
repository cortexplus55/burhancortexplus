import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";
import { localStepScore } from "@/lib/learning/local-step";
import { PATH_LOOKAHEAD } from "@/lib/learning/study-path-window";
import {
  addQuizStages,
  blockPracticeTargets,
  duplicateQuestionTexts,
  emptyQuizStages,
  slowPrepNotice,
  stablePlayableQuestions,
  timeQuizAsk,
  type BlockPracticeNode,
} from "@/lib/learning/quiz-speed";

const why = (options: string[]) => options.map((option) => `${option} seçeneği kuralın ayrı bir parçasına karşılık gelir.`);

function raw(text: string, correct: string, rest: string[], extra: Record<string, unknown> = {}) {
  const options = [correct, ...rest];
  return {
    text,
    options,
    correct,
    multi: false,
    explanation: "Doğru seçenek kuralın uygulanışını söyler ve diğerleri başka bir adımı anlatır.",
    optionWhy: why(options),
    misconceptionTag: "adım karışıklığı",
    learningObjective: "Sırayı uygulamak",
    ...extra,
  };
}

const STEMS = [
  ["Hangi işlem sıra bozulmadan uygulanır?", "koruma"],
  ["Sonuç hangi kayıtta tutulur?", "dengele"],
  ["Parçalar hangi düzende dizilir?", "izlenen"],
  ["Eşik aşıldığında hangi kapı kapanır?", "sınırla"],
  ["Karar hangi dayanağa bağlanır?", "ölçütler"],
  ["İstisna hangi maddeye tabidir?", "kuralcı"],
  ["İz sürme hangi hatta kalır?", "kapalıx"],
] as const;

const OTHERS = ["yedek bir", "yedek iki", "yedek üç"];

function pack(count: number, duplicateAt: number | null = null) {
  return STEMS.slice(0, count).map(([text, correct], index) =>
    raw(
      duplicateAt === index ? STEMS[0]![0] : text,
      duplicateAt === index ? STEMS[0]![1] : correct,
      OTHERS,
      index === 0 ? { review: { prompt: " " } } : {},
    ),
  );
}

function asker(draft: unknown) {
  return vi.fn(async (system: string) => {
    if (system.includes("denetçisisin")) return { issues: [] };
    if (system.startsWith("Sen aynı testi yazan")) return null;
    return { questions: draft };
  });
}

function question(text: string, multi = false): QuizQuestion {
  return {
    text,
    options: ["bir", "iki", "üç", "dört"],
    correct: ["bir"],
    multi,
    explanation: "açıklama",
  };
}

describe("test hazırlama hızı", () => {
  it("kararlı önek ilk üç tek cevaplı sorudur; boşluk, çok cevaplı ve kopya akışı durdurur", () => {
    const five = [0, 1, 2, 3, 4].map((index) => question(`soru ${index}`));
    expect(stablePlayableQuestions(five, 5)?.map((item) => item.text)).toEqual(["soru 0", "soru 1", "soru 2"]);
    const hole = [question("soru 0"), null, question("soru 2"), question("soru 3")];
    expect(stablePlayableQuestions(hole, 5)).toBeNull();
    const multiInside = [question("soru 0"), question("soru 1"), question("çok", true)];
    expect(stablePlayableQuestions(multiInside, 3)).toBeNull();
    expect(stablePlayableQuestions([...multiInside, question("soru 3")], 4)?.map((item) => item.text)).toEqual([
      "soru 0",
      "soru 1",
      "soru 3",
    ]);
    const copy = [question("Aynı kök"), question("aynı kök"), question("başka")];
    expect(stablePlayableQuestions(copy, 5)).toBeNull();
    expect(duplicateQuestionTexts(" Aynı Kök ", ["aynı kök"])).toBe(true);
  });

  it("akış ilk üç soruyu bir kez yayınlar ve ikinci soru taslağını öğrenciye koymaz", async () => {
    const seen: string[][] = [];
    const loop = await teacherQuizLoop(
      asker(pack(7)),
      { topicLabel: "Konu", prepTitle: "Hazırlık", pages: [{ page: 1, text: "Kaynak metni." }], count: 5 },
      Date.now(),
      {
        onPlayable: async (questions) => {
          seen.push(questions.map((item) => item.text));
        },
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(STEMS.slice(0, 3).map(([text]) => text));
    expect(loop.questions.slice(0, 3).map((item) => item.text)).toEqual(seen[0]);
    expect(loop.questions.every((item) => !("review" in item))).toBe(true);
    expect(loop.stages.draftMs).toBeGreaterThanOrEqual(0);
    expect(loop.stages.verifyMs).toBeGreaterThanOrEqual(0);
  });

  it("kopya kök kararlı öneği bozar ve öğrenciye ikinci kez gitmez", async () => {
    const onPlayable = vi.fn();
    const loop = await teacherQuizLoop(
      asker(pack(7, 1)),
      { topicLabel: "Konu", prepTitle: "Hazırlık", pages: [{ page: 1, text: "Kaynak metni." }], count: 5 },
      Date.now(),
      { onPlayable },
    );
    expect(onPlayable).not.toHaveBeenCalled();
    const texts = loop.questions.map((item) => item.text);
    expect(texts.filter((text) => text === STEMS[0]![0])).toHaveLength(1);
    expect(loop.rejected.some((row) => row.problems.some((problem) => problem.includes("Aynı kök")))).toBe(true);
  });

  it("aşama süreleri toplanır", async () => {
    const stages = emptyQuizStages();
    await timeQuizAsk(stages, "draft", async () => "yazım");
    await timeQuizAsk(stages, "verify", async () => "denetim");
    await timeQuizAsk(stages, "fix", async () => "onarım");
    const summed = addQuizStages(stages, { draftMs: 4, verifyMs: 5, fixMs: 6 });
    expect(summed.draftMs).toBeGreaterThanOrEqual(stages.draftMs);
    expect(summed.verifyMs).toBe(stages.verifyMs + 5);
    expect(summed.fixMs).toBe(stages.fixMs + 6);
  });

  it("aynı bloğun testi, doğru/yanlış'ı ve kartları en çok üç adımda istenir", () => {
    const nodes: BlockPracticeNode[] = [
      { id: "q", kind: "quiz", status: "open", session_meta: { topicId: "t1", lessonPart: 2 } },
      { id: "tf", kind: "true_false", status: "open", session_meta: { topicId: "t1", lessonPart: "2" } },
      { id: "cards", kind: "flashcards", status: "open", session_meta: { topicId: "t1" } },
      { id: "done", kind: "quiz", status: "done", session_meta: { topicId: "t1", lessonPart: 2 } },
      { id: "other", kind: "quiz", status: "open", session_meta: { topicId: "t2", lessonPart: 2 } },
      { id: "part", kind: "quiz", status: "open", session_meta: { topicId: "t1", lessonPart: 9 } },
      { id: "oral", kind: "oral", status: "open", session_meta: { topicId: "t1", lessonPart: 2 } },
      { id: "extra", kind: "flashcards", status: "open", session_meta: { topicId: "t1", lessonPart: 2 } },
    ];
    expect(blockPracticeTargets({ topicId: "t1", lessonPart: "2" }, nodes).map((node) => node.id)).toEqual([
      "q",
      "tf",
      "cards",
    ]);
    expect(blockPracticeTargets({ topicId: "" }, nodes)).toEqual([]);
  });

  it("uzun uyarı soru oynanabilir olunca susar; yerel puan sunucuyu beklemez", () => {
    expect(slowPrepNotice("quiz")).toBe(false);
    expect(slowPrepNotice("true_false")).toBe(false);
    expect(slowPrepNotice("flashcards")).toBe(false);
    expect(slowPrepNotice("lesson", true)).toBe(false);
    expect(slowPrepNotice("podcast")).toBe(true);
    expect(
      localStepScore(
        {
          type: "quiz",
          questions: [raw("Sırayı bozmadan uygulanan işlem hangisidir?", "koruma", OTHERS)],
        },
        { "0": "koruma" },
      ),
    ).toEqual({ score: 1, total: 1 });
    expect(
      localStepScore(
        { type: "true_false", items: [{ correct: true }, { correct: false }] },
        { "0": true, "1": true },
      ),
    ).toEqual({ score: 1, total: 2 });
    expect(PATH_LOOKAHEAD).toBe(2);
  });

  it("rota ölçümü, akışı ve blok ön hazırlığını bağlar", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    const run = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    const prefetch = readFileSync("src/lib/learning/lesson-prefetch.ts", "utf8");
    expect(route.match(/after\(\(\) => recordOpenTiming\(/g)).toHaveLength(3);
    expect(route).toContain('reason: "quiz_stages"');
    expect(route).toContain("requestBlockPracticePrefetch");
    expect(route).toContain("parsed.data.lessonStream === true");
    expect(route).toContain('if (action === "progress") {');
    expect(route).toContain('kind !== "lesson" && kind !== "quiz"');
    expect(run).toContain("reviewItemProblems");
    expect(run).toContain("duplicateQuestionTexts");
    expect(run).toContain("stablePlayableQuestions");
    const second = run.slice(run.indexOf("passes = 2"));
    expect(second).toContain("teacherQuizLoop(");
    expect(second.slice(0, second.indexOf("const seen"))).not.toContain("onPlayable");
    expect(prefetch).toContain("requestBlockPracticePrefetch");
    expect(prefetch).toContain("PATH_LOOKAHEAD");
    expect(session).toContain("localStepScore");
    expect(session).toContain("confirmStep");
    expect(session).toContain("moreComing={payload.building === true}");
    expect(session).toContain("slowNotice={slowPrepNotice(kind)}");
    expect(session).toContain("contentBuilding");
  });
});
