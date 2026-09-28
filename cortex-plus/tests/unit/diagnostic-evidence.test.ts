import { describe, expect, it } from "vitest";
import { hasRepetitiveSparseEvidence } from "@/lib/learning/diagnostic-evidence";

describe("first-lesson diagnostic evidence", () => {
  it("recognizes a long chapter that repeats only one short teaching fact", () => {
    const pages = Array.from({ length: 9 }, (_, index) =>
      `2. Birim Çember\nBirim çemberde yatay koordinat kosinüs, düşey koordinat sinüstür.\n` +
      `Bu bölümün ${index + 1}. çalışma sayfası fiziksel sayfa ${index + 10} üzerindedir.\n` +
      "Kavramı tanımla ve bir örneğe uygula.",
    );
    expect(hasRepetitiveSparseEvidence(pages)).toBe(true);
  });

  it("allows independently different page facts and rich repeated teaching text", () => {
    const diverse = [
      "Birim çemberde yatay koordinat kosinüstür.",
      "Birim çemberde düşey koordinat sinüstür.",
      "Birim çemberin yarıçapı 1'dir.",
    ];
    expect(hasRepetitiveSparseEvidence(diverse)).toBe(false);
    expect(hasRepetitiveSparseEvidence(Array(3).fill("Açıklama ve örnek. ".repeat(40)))).toBe(false);
    expect(hasRepetitiveSparseEvidence([diverse[0]])).toBe(false);
  });
});
