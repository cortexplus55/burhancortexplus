import { describe, expect, it } from "vitest";
import { incompleteFormulaLine, layoutBoard } from "@/lib/learning/lesson-board";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
const YES_NO = "Isı ve iş sınırdan geçen enerji türleri midir?";
const LEAKED = "Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olduğundan ifade doğrudur.";

describe("incomplete formula lines", () => {
  it("rejects an empty right-hand side and a trailing operator", () => {
    expect(incompleteFormulaLine("ΔE =")).toBe(true);
    expect(incompleteFormulaLine("ΔE = ")).toBe(true);
    expect(incompleteFormulaLine("ΔE = Q −")).toBe(true);
    expect(incompleteFormulaLine("ΔE = Q − W")).toBe(false);
    expect(incompleteFormulaLine("P = F/A")).toBe(false);
    const lines = layoutBoard("Kapalı sistem enerji dengesi şöyle yazılır: ΔE =\nΔE = Q − W");
    expect(lines.map((line) => line.text)).not.toContain("ΔE =");
    expect(lines.some((line) => line.kind === "formula" && line.text.includes("Q"))).toBe(true);
  });
});

describe("answer commentary stays out of the summary", () => {
  it("rejects the live explanation and keeps a lesson sentence", () => {
    expect(summaryLineProblem(LEAKED)).toBe("flashcard");
    expect(summaryLineProblem("Doğru cevap ΔE = Q − W bağıntısıdır.")).toBe("flashcard");
    expect(summaryLineProblem("Seçeneklerden ilki enerji dengesini yazar.")).toBe("flashcard");
    expect(summaryLineProblem("Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olur.")).toBeNull();
    expect(summaryLineProblem("P_mutlak = P_atm - P_vakum")).toBeNull();
  });
});

describe("yes/no retry and check mix", () => {
  it("restates the live yes/no instead of repeating it", () => {
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: YES_NO,
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Isı ve iş sınırdan geçen enerji türleridir.",
      },
      "tr",
      YES_NO,
    );
    expect(retry.prompt).not.toBe(YES_NO);
    expect(retry.prompt).toBe("Isı ve iş sınırdan geçen enerji türleridir. Doğru mu, yanlış mı?");
    expect(retry.prompt).not.toContain("başka sözcüklerle");
    expect(retry.options[retry.answerIndex]).toBe("Doğru");
  });
});
