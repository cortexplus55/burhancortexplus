import { describe, expect, it } from "vitest";
import { dropSparseSourceNumericChecks } from "@/lib/learning/lesson-teach";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";

const source = "Birim çemberde noktanın yatay koordinatı kosinüs, düşey koordinatı sinüstür.";

function lesson() {
  return lessonV2Schema.parse({
    title: "Birim Çember",
    sections: [
      {
        heading: "Kaynak ilişkisi",
        body: source,
        check: {
          type: "mcq",
          prompt: "Birim çemberde 135° açısının koordinatları nedir?",
          options: ["(−√2/2, √2/2)", "(√2/2, −√2/2)"],
          answerIndex: 0,
          explanation: "135° ikinci bölgede olduğundan ilk seçenek doğrudur.",
        },
      },
      {
        heading: "Koordinat adları",
        body: "Yatay koordinat kosinüs, düşey koordinat sinüstür.",
        check: {
          type: "mcq",
          prompt: "Birim çemberde yatay koordinat hangisidir?",
          options: ["Kosinüs", "Sinüs"],
          answerIndex: 0,
          explanation: "Yatay koordinat kosinüstür.",
        },
      },
    ],
  });
}

describe("sparse source lesson checks", () => {
  it("drops an unprovided numerical angle while preserving the source-backed check", () => {
    const result = dropSparseSourceNumericChecks(lesson(), source);
    expect(result.dropped).toBe(1);
    expect(result.lesson.sections[0].check).toBeUndefined();
    expect(result.lesson.sections[1].check?.options?.[0]).toBe("Kosinüs");
  });

  it("allows the numerical check if the value is actually in the source", () => {
    const result = dropSparseSourceNumericChecks(lesson(), `${source} 135° açısının koordinatları hesaplanır.`);
    expect(result.dropped).toBe(0);
  });

  it("does not treat citation and page numbers as teaching evidence", () => {
    const numberedSource = `[s.135] trigonometri.pdf: Bu bölümün 135. çalışma sayfası fiziksel sayfa 135 üzerindedir. ${source}`;
    const result = dropSparseSourceNumericChecks(lesson(), numberedSource);
    expect(result.dropped).toBe(1);
  });
});
