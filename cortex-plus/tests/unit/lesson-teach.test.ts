import { describe, expect, it } from "vitest";
import { reviewQuestionFor, retrySharesSubject } from "@/lib/learning/teacher-brain";

describe("missed-question retry", () => {
  const source = [
    "Avogadro sayısı, 1 mol madde içindeki tanecik sayısıdır.",
    "Mol, belirli sayıda tanecik içeren madde miktarıdır.",
  ].join(" ");
  const original = "Avogadro sayısı 1 mol madde içindeki atom veya molekül sayısını belirtir.";

  it("reasks Avogadro instead of the unrelated mol definition", () => {
    expect(retrySharesSubject(original, "Mol, belirli sayıda tanecik içeren madde miktarıdır.")).toBe(false);
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: original,
        options: ["Yanlış", "Doğru"],
        answerIndex: 1,
        explanation: "Avogadro sayısı, 1 mol maddedeki tanecik sayısını tanımlar.",
      },
      "tr",
      source,
    );
    expect(retrySharesSubject(original, retry.prompt)).toBe(true);
    expect(retry.prompt.toLocaleLowerCase("tr")).toMatch(/avogadro/);
    expect(retry.prompt).not.toMatch(/^Mol, belirli/);
    expect(retry.explanation.toLocaleLowerCase("tr")).toMatch(/avogadro/);
  });
});
