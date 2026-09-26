import { describe, expect, it } from "vitest";
import {
  auditQuantitative,
  isQuantitativeContext,
} from "@/lib/learning/quantitative-audit";

describe("auditQuantitative", () => {
  it("fizikte verilmeyen katsayıyı ve yarım satırı düşürür", () => {
    const issues = auditQuantitative({
      example: {
        prompt: "I = 2 A ve R = 4 Ω verildiğine göre güç kaçtır?",
        solution: "Gerçek güç = 0,80 × 2 = 1,6 W.\nI = 2 A",
      },
    });
    expect(issues.some((issue) => issue.includes("verilmeyen sayı"))).toBe(true);
    expect(issues.some((issue) => issue.includes("yarım"))).toBe(true);
  });

  it("verilenler ve formül varsa fizik örneğini geçirir", () => {
    const issues = auditQuantitative({
      example: {
        prompt: "I = 2 A ve R = 4 Ω.",
        givens: ["I = 2 A", "R = 4 Ω"],
        unknown: "Güç P",
        solution: "P = I × R değil, P = I² × R. P = 2 × 4 = 8 W.",
        steps: ["P = I² × R", "P = 2 × 4 = 8 W"],
        result: "8 W",
      },
    });
    expect(issues).toEqual([]);
  });

  it("matematikte kendi birimiyle tanımlanan değişkeni ve yarım satırı düşürür", () => {
    const issues = auditQuantitative({
      example: {
        prompt: "Kenar m = 5 m olarak verildi.",
        solution: "m = 5 m",
      },
    });
    expect(issues.some((issue) => issue.includes("kendi birimi") || issue.includes("yarım"))).toBe(
      true,
    );
  });

  it("formülsüz ve verisiz hesabı düşürür", () => {
    expect(isQuantitativeContext("h = 5 × 4 = 20 m")).toBe(true);
    const physics = auditQuantitative({
      sections: ["Oluşan yükseklik = 5 × 4 = 20 m."],
    });
    expect(physics.some((issue) => issue.includes("başlangıç verisi") || issue.includes("formül"))).toBe(
      true,
    );

    const math = auditQuantitative({
      sections: ["Alan = 3 × 4 = 12."],
    });
    expect(math.some((issue) => issue.includes("başlangıç verisi") || issue.includes("formül"))).toBe(
      true,
    );
  });

  it("formül ve veriler yazılmışsa hesabı geçirir", () => {
    const issues = auditQuantitative({
      sections: [
        "Alan = uzunluk × genişlik. Kenarlar 3 m ve 4 m. Alan = 3 × 4 = 12.",
      ],
    });
    expect(issues.filter((issue) => issue.includes("formül") || issue.includes("başlangıç"))).toEqual(
      [],
    );
  });
});
