import { describe, expect, it } from "vitest";
import { layoutBoard, restoreMathNotation } from "@/lib/learning/lesson-board";
import {
  conceptsWorthWidening,
  foreignToTopic,
  realGasPrecisionIssue,
  selectPagesForTitle,
} from "@/lib/learning/lesson-claims";
import { summaryLineProblem } from "@/lib/learning/lesson-grounding";
import { ambiguousRelationQuestion, ensureThreeChecks, scopeLessonToTopic } from "@/lib/learning/lesson-repair";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const TOPIC = "Sınır İşi ve Prosesler";
const SOURCE = [
  "Sınır işi, hareketli sınırı olan sistemlerde basınç-hacim eğrisinin altında kalan alan olarak tanımlanır.",
  "Sınır işi bir prosesin yoluna bağlıdır.",
  "Sabit basınçta sınır işi W = P(V₂ − V₁) eşitliğiyle yazılır.",
  "P = 100 kPa. V₁ = 0.2 m³. V₂ = 0.5 m³. Sonuç 30 kJ olur.",
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
  it("rejects a short or repeated left-hand side", () => {
    expect(ambiguousRelationQuestion("Pv hangi bağıntıyla hesaplanır?", ["Pv = ZRT"])).toBe(true);
    expect(
      ambiguousRelationQuestion("r hangi bağıntıyla hesaplanır?", ["r = P/P cr", "r = T/T cr"]),
    ).toBe(true);
    expect(ambiguousRelationQuestion("ΔU hangi bağıntıyla hesaplanır?", ["ΔU = Q − W"])).toBe(false);
  });

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

describe("scoped boundary-work lesson", () => {
  it("keeps the clicked topic, a checked example, and drops the other chapter", () => {
    const lesson: LessonV2 = {
      title: "Gerçek Gazlar ve Sıkıştırılabilirlik Faktörü",
      overview: "Sınır işi, hareketli sınırda tanımlanır. Sınır işi yola bağlıdır.",
      sections: [
        {
          heading: "Sınır işi",
          body: "Toplam iş ise ile bulunur: W = ∫ 1 2 P dV. Sabit basınçta W = P(V₂ − V₁) eşitliği geçerlidir. Sınır işi bir prosesin yoluna bağlıdır.",
        },
        {
          heading: "Gerçek gaz",
          body: "Pv = ZRT bağıntısında hacim V kullanılır. Düşük sapma (Z=1.03) ideal gaz varsayımını bozmaz.",
          check: {
            type: "mcq",
            prompt: "Pv hangi bağıntıyla hesaplanır?",
            options: ["Pv = ZRT", "r = P/P cr", "r = T/T cr", "W = 0"],
            answerIndex: 0,
            explanation: "Pv = ZRT bağıntısında hacim V kullanılır.",
          },
        },
      ],
      summary: ["∫ P dV genel sınır işi tanımı, diğerleri yanlış veya özel durumları belirtir."],
    };
    const scoped = scopeLessonToTopic(lesson, SOURCE, TOPIC);
    const published = JSON.stringify(scoped);
    expect(scoped.title).toBe(TOPIC);
    expect(published).not.toMatch(/ZRT|1[.,]03|hangi bağıntıyla hesaplanır/);
    expect(published).not.toMatch(/ise ile bulunur/);
    expect(published).toMatch(/∫₁²/);
    expect(scoped.example?.solution).toMatch(/30 kJ/);
    expect(scoped.summary?.join(" ") ?? "").not.toMatch(/diğerleri/);
  });

  it("splits glued work formulas into a four-option question", () => {
    const lesson = ensureThreeChecks({
      title: TOPIC,
      sections: [
        {
          heading: "Sınır işi",
          body: "Sınır işi, hareketli sınırda tanımlanır. W = ∫₁² P dV Sabit basınçta W = P(V₂ − V₁) eşitliği geçerlidir. Sınır işi bir prosesin yoluna bağlıdır.",
        },
        {
          heading: "Rijit tank",
          body: "Rijit tankta hacim sabittir ve dV = 0 olduğundan sınır işi sıfırdır.",
          check: {
            type: "mcq",
            prompt: "Rijit bir tankta sınır işi neden sıfırdır?",
            options: [
              "Hacim sabit olduğu için dV sıfırdır.",
              "Basınç sıfır olduğu için iş sıfırdır.",
              "Sıcaklık sabit olduğu için iş sıfırdır.",
              "Kütle değiştiği için iş sıfırdır.",
            ],
            answerIndex: 0,
            explanation: "Rijit tankta hacim sabittir ve dV = 0 olduğundan sınır işi sıfırdır.",
          },
        },
      ],
    } as LessonV2);
    const checks = lesson.sections.map((section) => section.check).filter((check) => check);
    expect(checks.length).toBeGreaterThanOrEqual(3);
    for (const check of checks) {
      expect(check?.type).toBe("mcq");
      expect(check?.options).toHaveLength(4);
    }
    expect(checks.some((check) => /Sınır işinin genel tanımı|Sabit basınçta sınır işi/.test(check?.prompt ?? ""))).toBe(
      true,
    );
  });
});
