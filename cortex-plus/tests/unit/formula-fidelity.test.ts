import { describe, expect, it } from "vitest";
import {
  formulaFidelityIssues,
  formulaMismatches,
} from "@/lib/learning/formula-fidelity";

/**
 * Canlıda olan: ders "Boussinesq — Tekil Yük" başlıklı bir bölüm yazdı ve
 * formülü tamamen uydurdu. Bölüm başlığı kaynaktan geliyordu ama bölümün
 * içi modelin genel bilgisindendi ve kimse karşılaştırmıyordu.
 */
const zeminSayfa12 = [
  "Δσ z = (3 Q) / (2 π z 2 ) · [ 1 / (1 + (r/z) 2 ) ] 5/2",
  "Δσ z = q 0 · (B · L) / [ (B + z)(L + z) ]",
];

describe("formulaMismatches", () => {
  it("catches the Boussinesq formula the lesson invented", () => {
    const lesson = [
      "Boussinesq metodu tekil yükün derinlikteki etkisini verir. Δσ z = (Q/π) × (1/(1 + (z/R)²)) burada Q yüzeydeki yüktür.",
    ];
    const issues = formulaMismatches(lesson, zeminSayfa12);
    expect(issues).toHaveLength(1);
    expect(issues[0].sourceFormula).toContain("3 Q");
  });

  it("accepts the formula written as the source has it", () => {
    const lesson = [
      "Δσ z = (3 Q) / (2 π z 2 ) · [ 1 / (1 + (r/z) 2 ) ] 5/2 biçiminde hesaplanır.",
    ];
    expect(formulaMismatches(lesson, zeminSayfa12)).toEqual([]);
  });

  it("tolerates spacing and multiplication-sign differences", () => {
    // Aynı formül, farklı yazım. Yanlış alarm dersi hiç ürettirmez.
    const lesson = ["Δσz = q0*(B*L)/[(B+z)(L+z)]"];
    expect(formulaMismatches(lesson, zeminSayfa12)).toEqual([]);
  });

  it("says nothing when the source has no formulas", () => {
    // Edebiyat belgesinde formül yok; bu bekçi orada hiç konuşmamalı.
    const lesson = ["Plastisite indisi PI = LL - PL biçiminde yazılır."];
    expect(formulaMismatches(lesson, [])).toEqual([]);
  });

  it("ignores a formula the source never defines", () => {
    // Kaynakta karşılığı olmayan bir ifadeyi yanlış sayamayız.
    const lesson = ["Boşluk oranı e = Vv / Vs olarak tanımlanır."];
    expect(formulaMismatches(lesson, zeminSayfa12)).toEqual([]);
  });

  it("does not trip on ordinary sentences with an equals sign", () => {
    const lesson = ["Bu derste amaç = anlamak."];
    expect(formulaMismatches(lesson, zeminSayfa12)).toEqual([]);
  });

  it("tells the model both versions so it can fix itself", () => {
    const lesson = ["Δσ z = (Q/π) × (1/(1 + (z/R)²))"];
    const [message] = formulaFidelityIssues(lesson, zeminSayfa12);
    expect(message).toContain("Kaynakta:");
    expect(message).toContain("derste:");
  });
});
