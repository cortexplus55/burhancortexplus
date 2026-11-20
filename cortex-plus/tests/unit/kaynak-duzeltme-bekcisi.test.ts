import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LessonBlock, LessonScreen, LessonV3 } from "@/lib/learning/lesson-v3";
import { LESSON_V3_FORMAT, readLessonV3 } from "@/lib/learning/lesson-v3";
import { guardLessonForCorrection, guardScreensForCorrection } from "@/lib/learning/lesson-correction-guard";
import { quizKeyRepeatsSourceError, repeatsSourceError, type SourceCorrectionWarning } from "@/lib/learning/source-correction";

/*
  20 Kasım 2026: kaynak düzeltme bekçisi canlı ders yolunda. Not bir formülü bilimsel olarak yanlış yazmışsa ders
  ekranları, özet ve test doğrusunu öğretir; yanlışı yazan cümle, kutu ve soru yayımdan önce düşer. Örnekler jenerik
  ("Q = B / CD" uydurma bir bağıntı; doğrusu "Q = B · CD").
*/

const CLAIM = "Q = B / CD";
const TRUTH = "Q = B · CD";
const warning: SourceCorrectionWarning = {
  documentClaim: CLAIM,
  verifiedTruth: TRUTH,
  explanation: "Jenerik açıklama.",
} as SourceCorrectionWarning;

const text = (value: string): LessonBlock => ({ type: "text", text: value }) as LessonBlock;
const formula = (expression: string): LessonBlock =>
  ({ type: "formula", formula: { title: "Bağıntı", expression } }) as LessonBlock;
const mcq = (options: string[], answerIndex: number, explanation: string): LessonBlock =>
  ({
    type: "check",
    check: { type: "mcq", prompt: "Q niceliği hangi bağıntıyla bulunur?", options, answerIndex, explanation },
  }) as LessonBlock;
const trap: LessonBlock = {
  type: "exam_trap_card",
  trap: { wrong: `Öğrenciler ${CLAIM} yazar.`, right: `Doğrusu ${TRUTH}.` },
} as unknown as LessonBlock;

const OPTIONS = [CLAIM, TRUTH, "Q = B + CD", "Q = CD / B", "Q = B − CD"];

/** Her yerde kaynağın yanlışını öğreten (modelin hatalı yazdığı) bir ders. */
function wrongLesson(): LessonV3 {
  return {
    format: LESSON_V3_FORMAT,
    title: "Q niceliği",
    objective: `Q niceliğini ${CLAIM} ile hesaplamak.`,
    overview: "Q niceliği iki büyüklüğe bağlıdır.",
    screens: [
      {
        heading: "Q niceliği",
        concept: "Q niceliği",
        blocks: [text(`Q niceliği ${CLAIM} bağıntısıyla bulunur. Birimleri tutarlı yazılır.`), formula(CLAIM), trap, mcq(OPTIONS, 0, `Bağıntı ${CLAIM} olduğu için A doğrudur.`)],
      },
      {
        heading: "Doğru kullanım",
        concept: "Q niceliği",
        blocks: [text(`Doğru bağıntı ${TRUTH} biçimindedir.`), formula(TRUTH), mcq(OPTIONS, 1, `Q, ${TRUTH} ile bulunur.`)],
      },
    ] as LessonScreen[],
    summary: [`Q = B / CD ile hesaplanır.`, `Doğrusu: ${TRUTH}.`, "Birimleri kontrol et."],
    commonMistake: { claim: "Öğrenciler B ile CD'yi toplar.", correction: `Bağıntı ${CLAIM} biçiminde kullanılır.` },
    nextFocus: [],
  } as LessonV3;
}

/** Yazılı her önerme (sınav tuzağı hariç: yanlış inancı bilerek gösterir). */
function taughtStatements(lesson: LessonV3): string[] {
  const out: string[] = [];
  for (const screen of lesson.screens) {
    for (const block of screen.blocks) {
      if (block.type === "text") out.push(block.text);
      if (block.type === "formula") out.push(block.formula.expression);
      if (block.type === "check") {
        const check = block.check as { options?: string[]; answerIndex?: number; explanation?: string };
        out.push(check.options?.[check.answerIndex ?? -1] ?? "", check.explanation ?? "");
      }
    }
  }
  return [...out, ...(lesson.summary ?? []), lesson.objective ?? "", lesson.commonMistake?.correction ?? ""].filter(Boolean);
}

describe("birim: bekçi yalnız siler, doğrusu kalır", () => {
  it("yanlış cümle, formül kutusu, soru, özet maddesi ve hedef düşer; doğru olanlar ve tuzak kartı kalır", () => {
    const { lesson, dropped } = guardLessonForCorrection(wrongLesson(), warning);
    expect(dropped).toBeGreaterThanOrEqual(6);
    for (const statement of taughtStatements(lesson)) expect(repeatsSourceError(statement, warning)).toBe(false);
    const [first, second] = lesson.screens;
    expect(first!.blocks.map((block) => block.type)).toEqual(["text", "exam_trap_card"]);
    expect((first!.blocks[0] as { text: string }).text).toBe("Birimleri tutarlı yazılır.");
    expect(second!.blocks.map((block) => block.type)).toEqual(["text", "formula", "check"]);
    expect(lesson.summary).toEqual([`Doğrusu: ${TRUTH}.`, "Birimleri kontrol et."]);
    expect(lesson.commonMistake).toBeUndefined();
    expect(lesson.objective).toBeUndefined();
    // Doğru formül her kalan adımda doğru olan şekliyle.
    expect(JSON.stringify(lesson)).toContain(TRUTH);
  });

  it("düzeltme yoksa ders aynen döner (aynı başvuru)", () => {
    const lesson = wrongLesson();
    expect(guardLessonForCorrection(lesson, null).lesson).toBe(lesson);
    expect(guardScreensForCorrection(lesson.screens, null).screens).toBe(lesson.screens);
  });

  it("yayımda bütün blokları yanlış olan ekran düşer; kayıtlı ders okunurken ekran sayısı değişmez", () => {
    const allWrong: LessonScreen = { heading: "Yanlış", concept: "Q", blocks: [formula(CLAIM), text(`${CLAIM} kullanılır.`)] } as LessonScreen;
    expect(guardScreensForCorrection([allWrong], warning).screens).toHaveLength(0);
    expect(guardScreensForCorrection([allWrong], warning, { keepScreens: true }).screens).toHaveLength(1);
  });
});

describe("entegrasyon: canlı ders hattı, kayıtlı ders ve test", () => {
  it("teacherLessonPipeline: yazar yanlışı yazsa da yayımlanan ve teslim edilen ders doğrusunu öğretir", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const queue = [JSON.stringify(wrongLesson())];
    const published: LessonV3[] = [];
    const result = await teacherLessonPipeline(
      {
        write: async (_system, _user, onDelta) => {
          const body = queue.shift() ?? "";
          onDelta(body);
          return { text: body, finish: "stop" };
        },
      },
      {
        topicLabel: "Q niceliği",
        prepTitle: "Fizik vize",
        pages: [{ page: 1, text: `Q niceliği ${CLAIM} bağıntısıyla bulunur.` }],
        upcomingTopics: [],
        sanity: false,
        sourceCorrection: warning,
      },
      { onPublish: (item) => void published.push(item.lesson) },
    );
    expect(result.lesson).toBeTruthy();
    for (const lesson of [...published, result.lesson!]) {
      for (const statement of taughtStatements(lesson)) expect(repeatsSourceError(statement, warning)).toBe(false);
    }
    expect(JSON.stringify(result.lesson)).toContain(TRUTH);
    expect(info).toHaveBeenCalledWith("teacher_lesson_correction_guard", expect.objectContaining({ dropped: expect.any(Number) }));
    info.mockRestore();
  });

  it("kayıtlı ders okunurken (readLessonV3) dersin kendi uyarısıyla aynı bekçi çalışır", () => {
    const stored = { ...wrongLesson(), sourceCorrectionWarning: warning };
    const read = readLessonV3(stored);
    expect(read).toBeTruthy();
    expect(read!.screens).toHaveLength(2);
    for (const statement of taughtStatements(read!)) expect(repeatsSourceError(statement, warning)).toBe(false);
  });

  it("test: anahtarı kaynağın yanlışını taşıyan soru elenir, doğrusunu soran kalır", () => {
    expect(quizKeyRepeatsSourceError({ correct: [CLAIM], text: "Q hangi bağıntıyla bulunur?" }, warning)).toBeTruthy();
    expect(quizKeyRepeatsSourceError({ correct: [TRUTH], text: "Q hangi bağıntıyla bulunur?" }, warning)).toBeNull();
  });
});
