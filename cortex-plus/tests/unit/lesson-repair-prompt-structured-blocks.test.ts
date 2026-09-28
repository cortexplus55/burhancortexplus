import { describe, expect, it } from "vitest";
import { lessonRepairPrompt, type LessonCheck } from "@/lib/learning/lesson-repair";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const ISSUES: LessonCheck[] = [{ code: "stem_grammar", detail: "Cümle özne almıyor." }];

function baseLesson(): LessonV2 {
  return {
    title: "Mol Kütlesi",
    sections: [
      {
        heading: "Mol Kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
      },
    ],
  };
}

describe("lessonRepairPrompt — structured block visibility", () => {
  it("includes an existing formula/procedure/table in the serialized lesson the repair model sees", () => {
    const lesson = baseLesson();
    lesson.sections[0]!.formula = { title: "Bağıntı", expression: "n = m / M" };
    lesson.sections[0]!.procedure = {
      steps: [
        { label: "Adım 1", detail: "Kütleyi ölç." },
        { label: "Adım 2", detail: "Mol kütlesine böl." },
      ],
    };
    lesson.sections[0]!.table = { columns: ["A", "B"], rows: [["1", "2"]] };

    const prompt = lessonRepairPrompt(lesson, ISSUES, "kaynak metni");
    expect(prompt).toContain("n = m / M");
    expect(prompt).toContain("Kütleyi ölç.");
    expect(prompt).toContain('"columns":["A","B"]');
  });

  it("tells the model not to duplicate formula/procedure/table content into the rewritten body", () => {
    const prompt = lessonRepairPrompt(baseLesson(), ISSUES, "kaynak metni");
    expect(prompt).toMatch(/aynı formülü\/adımları\/tabloyu tekrar etme/);
  });

  it("serializes null for formula/procedure/table when a section has none (no crash, no undefined leak)", () => {
    const prompt = lessonRepairPrompt(baseLesson(), ISSUES, "kaynak metni");
    expect(prompt).toContain('"formula":null');
    expect(prompt).toContain('"procedure":null');
    expect(prompt).toContain('"table":null');
  });
});
