import { describe, expect, it } from "vitest";
import { lessonV2Schema, type LessonV2 } from "@/lib/learning/teaching-standards";

const MOL = "Mol kütlesi ve kütle-mol hesapları";

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
