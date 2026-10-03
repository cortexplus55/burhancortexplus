import { describe, expect, it } from "vitest";
import { layoutBoard, restoreMathNotation } from "@/lib/learning/lesson-board";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";

describe("subscripts and gapped frames", () => {
  it("restores reduced properties and integral limits", () => {
    expect(restoreMathNotation("P r = P/P cr ve T r = T/T cr")).toBe("Pᵣ = P/P_cr ve Tᵣ = T/T_cr");
    expect(restoreMathNotation("W = ∫ 1 2 P dV")).toBe("W = ∫₁² P dV");
    expect(restoreMathNotation("P = F/A")).toBe("P = F/A");
  });

  it("does not leave ise ile bulunur when the formula moves", () => {
    const lines = layoutBoard("Toplam iş ise W = ∫ 1 2 P dV ile bulunur.");
    const text = lines.map((line) => line.text).join(" ");
    expect(text).not.toMatch(/ise ile bulunur/);
    expect(text).toMatch(/∫₁²/);
  });
});

describe("symbol questions, summary leaks, and real-gas precision", () => {

  it("drops the live summary leak and keeps a boundary-work sentence", () => {
    expect(
      summaryLineProblem("∫ P dV genel sınır işi tanımı, diğerleri yanlış veya özel durumları belirtir."),
    ).toBe("flashcard");
    expect(summaryLineProblem("Sınır işi, hareketli sınırda basınç-hacim eğrisinin altında kalan alandır.")).toBeNull();
  });
});
