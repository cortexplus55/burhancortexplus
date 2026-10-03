import { describe, expect, it } from "vitest";
import { layoutBoard, restoreMathNotation } from "@/lib/learning/lesson-board";
import {
  conceptsWorthWidening,
  foreignToTopic,
  realGasPrecisionIssue,
  selectPagesForTitle,
} from "@/lib/learning/lesson-claims";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";

const TOPIC = "Sınır İşi ve Prosesler";
const SOURCE = [
  "Sınır işi, hareketli sınırı olan sistemlerde basınç-hacim eğrisinin altında kalan alan olarak tanımlanır.",
  "Sınır işi bir prosesin yoluna bağlıdır.",
  "Sabit basınçta sınır işi W = P(V₂ − V₁) eşitliğiyle yazılır.",
  "P = 100 kPa. V₁ = 0.2 m³. V₂ = 0.5 m³. Sonuç 30 kJ olur.",
  "Gerçek gazlar başka bölümde Pv = ZRT ile yazılır.",
].join(" ");

describe("topic span", () => {
  it("does not widen a leftover word onto another chapter", () => {
    const mapped = "Sınır işi hareketli sınırda tanımlanır. Sınır işi yola bağlıdır.";
    expect(conceptsWorthWidening(TOPIC, mapped)).toEqual([]);
    expect(
      selectPagesForTitle(TOPIC, [4], [
        { pageNumber: 4, text: mapped },
        { pageNumber: 9, text: "Gerçek gazlar ve sıkıştırılabilirlik. Gaz prosesleri Pv = ZRT ile yazılır." },
      ]),
    ).toEqual([4]);
  });

  it("drops real-gas sentences that are outside the clicked topic", () => {
    expect(foreignToTopic("Pv = ZRT gerçek gazlar için yazılır.", SOURCE, TOPIC)).toBe(true);
    expect(foreignToTopic("Sınır işi yola bağlıdır.", SOURCE, TOPIC)).toBe(false);
    expect(foreignToTopic("Pv = ZRT", "Kısa kaynak.", TOPIC)).toBe(false);
  });
});

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

  it("flags a total-volume reading of Pv = ZRT and an unsourced Z claim", () => {
    expect(realGasPrecisionIssue("Pv = ZRT bağıntısında hacim V kullanılır.", SOURCE)).toBe(true);
    expect(realGasPrecisionIssue("PV = ZRT toplam hacim için yazılır.", SOURCE)).toBe(true);
    expect(
      realGasPrecisionIssue("Düşük sapma (Z=1.03) ideal gaz varsayımını bozmaz.", SOURCE),
    ).toBe(true);
    expect(
      realGasPrecisionIssue(
        "Düşük sapma (Z=1.03) ideal gaz varsayımını bozmaz.",
        "Kaynak: düşük sapma (Z=1.03) ideal gaz varsayımını bozmaz.",
      ),
    ).toBe(false);
    expect(realGasPrecisionIssue("Pv = ZRT bağıntısında v özgül hacimdir.", SOURCE)).toBe(false);
  });
});
