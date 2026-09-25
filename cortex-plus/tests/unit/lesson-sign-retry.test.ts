import { describe, expect, it } from "vitest";
import { incompleteFormulaLine, layoutBoard } from "@/lib/learning/lesson-board";
import { rewriteSignFlip, signConventionFlip } from "@/lib/learning/lesson-claims";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import {
  ensureThreeChecks,
  exampleIsComplete,
  polishWorkedExample,
  workedExampleNeedsFormula,
} from "@/lib/learning/lesson-repair";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const SIGN =
  "ΔE = Q - W formülüne göre, Q pozitif ve W negatif ise ΔE = Q - (-W) = Q + W şeklinde artar";
const YES_NO = "Isı ve iş sınırdan geçen enerji türleri midir?";
const LEAKED = "Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olduğundan ifade doğrudur.";
const BARE = "Sonuç = ΔE = 20 - 5 = 15 kJ";
const PROSE = "Sistem 80 kJ ısı alıyor ve 30 kJ iş yapıyor, bu yüzden iç enerji 50 kJ artmıştır.";
const LAW = "Kapalı sistemde enerji değişimi ΔE = Q - W ve iç enerji ΔU = Q − W ile yazılır.";

describe("sign convention algebra", () => {
  it("flags the live chain and rewrites it to the absolute-value form", () => {
    expect(signConventionFlip(SIGN)).toBe(true);
    expect(signConventionFlip("Q - (-W) = Q + W")).toBe(true);
    expect(signConventionFlip("-(-X) = X")).toBe(true);
    expect(rewriteSignFlip(SIGN)).toBe(
      "ΔE = Q - W formülüne göre, Q pozitif ve W negatif ise ΔE = Q − W = Q + |W| şeklinde artar",
    );
  });

  it("leaves a magnitude, a correct chain, and a numeric identity alone", () => {
    expect(signConventionFlip("Q - (-|W|) = Q + |W|")).toBe(false);
    expect(signConventionFlip("ΔE = Q − W = Q + |W|")).toBe(false);
    expect(signConventionFlip("-(-3) = 3")).toBe(false);
    expect(rewriteSignFlip("ΔE = Q − W = Q + |W|")).toBe("ΔE = Q − W = Q + |W|");
  });
});

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

describe("worked examples show formula, substitution, and result", () => {
  it("builds both live examples from the lesson formula", () => {
    expect(workedExampleNeedsFormula(BARE)).toBe(true);
    expect(workedExampleNeedsFormula(PROSE)).toBe(true);
    expect(polishWorkedExample(BARE, LAW)).toBe("ΔE = Q − W = 20 kJ − 5 kJ = 15 kJ");
    expect(polishWorkedExample(PROSE, LAW)).toBe("ΔU = Q − W = 80 kJ − 30 kJ = 50 kJ");
    expect(polishWorkedExample(PROSE, "Bu derste formül yok.")).toBeNull();
  });

  it("keeps a chain that already has the formula and a pressure calculation", () => {
    const ready = "ΔU = Q − W = 30 kJ − 0 = 30 kJ";
    const gas = "ΔU = 2 × 0.718 × (450 − 300) = 215.4 kJ";
    const pressure = "P_abs = P_gage + P_atm = 49.05 kPa + 95 kPa = 144.1 kPa";
    expect(workedExampleNeedsFormula(ready)).toBe(false);
    expect(workedExampleNeedsFormula(gas)).toBe(false);
    expect(workedExampleNeedsFormula(pressure)).toBe(false);
    expect(polishWorkedExample(ready, LAW)).toBe(ready);
    expect(exampleIsComplete(ready)).toBe(true);
    expect(exampleIsComplete(gas)).toBe(true);
    expect(exampleIsComplete(`${pressure}.`)).toBe(true);
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

  it("keeps at most one true/false when the lesson has equations", () => {
    const binary = (prompt: string) => ({
      type: "trueFalse" as const,
      prompt,
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: "Isı ve iş sınırdan geçen enerji türleridir.",
    });
    const lesson = ensureThreeChecks({
      title: "Birinci Yasa",
      overview: LAW,
      sections: [
        { heading: "Denge", body: LAW, check: binary(YES_NO) },
        {
          heading: "Sınır",
          body: "Isı ve iş sınırdan geçen enerji türleridir ve kapalı sistemde kütle geçmez.",
          check: binary("Kapalı sistemde kütle geçer mi?"),
        },
        {
          heading: "İç enerji",
          body: "Kinetik ve potansiyel enerji ihmal edilirse ΔE = ΔU olur.",
          check: binary("Enerji dengesi ısı ve iş ile yazılır mı?"),
        },
      ],
    } as LessonV2);
    const checks = lesson.sections.map((section) => section.check).filter((check) => check);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    const binaryCount = checks.filter((check) => check?.type === "trueFalse").length;
    expect(binaryCount).toBeLessThanOrEqual(1);
    const multiple = checks.find((check) => check && check.options.length >= 4);
    expect(multiple?.options).toHaveLength(4);
    expect(multiple?.options.filter((option) => option === multiple.options[multiple.answerIndex])).toHaveLength(1);
  });
});
