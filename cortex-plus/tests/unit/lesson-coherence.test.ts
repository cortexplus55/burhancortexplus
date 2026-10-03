import { describe, expect, it } from "vitest";
import { danglingOpener, retainAnchoredSentences } from "@/lib/learning/lesson-coherence";

describe("lesson coherence gate", () => {
  it("drops an anaphor whose antecedent was deleted and keeps a defined 'bu sayıya'", () => {
    expect(danglingOpener("Bu sayı atom veya molekül sayısını ifade eder.")).toBe(true);
    expect(danglingOpener("Bu sayıya Avogadro sayısı denir.")).toBe(false);
    const kept = retainAnchoredSentences([
      "Bu sayı atom veya molekül sayısını ifade eder.",
      "Böylece tanecik sayısını hesaplamak kolaylaşır.",
    ]);
    expect(kept).toEqual([]);
    const anchored = retainAnchoredSentences([
      "Avogadro sayısı 6,02×10²³ taneciktir.",
      "Bu sayı atom veya molekül sayısını ifade eder.",
    ]);
    expect(anchored).toHaveLength(2);
  });
});
