import { describe, expect, it } from "vitest";
import { finishTaughtLesson } from "@/lib/learning/lesson-teach";
import { lessonV2Schema, type LessonV2 } from "@/lib/learning/teaching-standards";

const MOL = "Mol kütlesi ve kütle-mol hesapları";

const MOL_SOURCE = [
  "[s.3] pdf-12-sayfa.pdf: Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbon 12 g/mol, oksijen 16 g/mol olduğunda karbondioksit 12 + 2 × 16 = 44 g/mol olur.",
  "[s.4] pdf-12-sayfa.pdf: Kütle ile mol arasındaki bağıntı n = m / M şeklindedir. Örnek: 88 g karbondioksit için n = 88 / 44 = 2 mol. Tanecik sayısı N = n × N_A bağıntısıyla bulunur.",
].join("\n");

function baseLesson(): LessonV2 {
  return {
    title: MOL,
    sections: [
      {
        heading: "Mol kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbondioksitte karbon 12 g/mol ve iki oksijen 2 × 16 g/mol toplanır. Toplam 44 g/mol olur.",
        check: {
          type: "mcq",
          prompt: "88 g karbondioksit kaç mol eder?",
          options: ["2 mol", "3872 mol", "0,5 mol", "88 mol"],
          answerIndex: 0,
          explanation: "Bölme, kütleyi mol kütlesine böler; çarpım başka bir büyüklüktür.",
          optionWhy: [
            "88 / 44 = 2 mol eder.",
            "Bölme yerine çarpma yapılmış.",
            "Bölme ters çevrilmiş.",
            "Verilen kütle sonuç sanılmış.",
          ],
        },
      },
    ],
  };
}

describe("lessonV2Schema — formula/procedure/table fields", () => {
  it("accepts a well-formed formula, procedure and table", () => {
    const lesson = baseLesson();
    lesson.sections[0]!.formula = {
      title: "Mol Sayısı Bağıntısı",
      expression: "n = m / M",
      note: "88 g karbondioksit için n = 88 / 44 = 2 mol.",
    };
    lesson.sections[0]!.procedure = {
      title: "Mol sayısı hesaplama",
      steps: [
        { label: "Kütleyi belirle", detail: "88 g karbondioksit tartılır." },
        { label: "Mol kütlesine böl", detail: "88 / 44 = 2 mol bulunur." },
      ],
    };
    lesson.sections[0]!.table = {
      caption: "Kütle-mol karşılıkları",
      columns: ["Kütle (g)", "Mol"],
      rows: [
        ["44", "1"],
        ["88", "2"],
      ],
    };
    const parsed = lessonV2Schema.parse(lesson);
    expect(parsed.sections[0]?.formula?.expression).toBe("n = m / M");
    expect(parsed.sections[0]?.procedure?.steps).toHaveLength(2);
    expect(parsed.sections[0]?.table?.rows).toHaveLength(2);
  });

  it("drops a malformed procedure (fewer than 2 steps) without breaking the rest of the section", () => {
    const lesson = baseLesson();
    // Malformed at runtime (schema requires >= 2 steps), not at the type
    // level — zod's `.min()` isn't reflected in the inferred TS type.
    lesson.sections[0]!.procedure = {
      steps: [{ label: "Tek adım", detail: "Yetersiz." }],
    };
    const parsed = lessonV2Schema.parse(lesson);
    expect(parsed.sections[0]?.procedure).toBeUndefined();
    expect(parsed.sections[0]?.body).toContain("Mol kütlesi");
  });
});

describe("finishTaughtLesson — structured block fabrication guard", () => {
  it("keeps a formula card whose numbers are grounded in the source", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.formula = {
      title: "Mol Sayısı Bağıntısı",
      expression: "n = m / M",
      note: "88 g karbondioksit için n = 88 / 44 = 2 mol.",
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.formula?.expression).toBe("n = m / M");
  });

  it("drops a formula card that contains a number not present anywhere in the source", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.formula = {
      title: "Mol Sayısı Bağıntısı",
      expression: "n = m / M",
      note: "57 g karbondioksit için kullanılır.",
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.formula).toBeUndefined();
  });

  it("drops a procedure that contains a fabricated number", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.procedure = {
      steps: [
        { label: "Kütleyi belirle", detail: "57 g karbondioksit tartılır." },
        { label: "Mol kütlesine böl", detail: "57 / 44 mol bulunur." },
      ],
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.procedure).toBeUndefined();
  });

  it("drops a formula note that just echoes the section body word-for-word", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.formula = {
      title: "Mol Kütlesi",
      expression: "n = m / M",
      // Near-verbatim copy of section.body above — same clause order,
      // grounded numbers, but adds no new information over the body.
      note: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbondioksitte karbon 12 g/mol ve iki oksijen 2 × 16 g/mol toplanır.",
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.formula).toBeUndefined();
  });

  it("drops a reference table with a fabricated cell value", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.table = {
      columns: ["Kütle (g)", "Mol"],
      rows: [["570", "13"]],
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.table).toBeUndefined();
  });

  it("keeps a reference table whose values are all grounded in the source", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.table = {
      columns: ["Kütle (g)", "Mol"],
      rows: [
        ["44", "1"],
        ["88", "2"],
      ],
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: MOL });
    expect(finished.lesson.sections[0]?.table?.rows).toHaveLength(2);
  });
});
