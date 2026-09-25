import { describe, expect, it } from "vitest";
import {
  formulaFidelityIssues,
  formulaMismatches,
  withoutMismatchedFormulas,
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

  it("does not measure a quantity against a function of it", () => {
    // Canlıda çıkan yanlış alarm. Kaynak sayfasında yalnızca açının
    // sayısal değeri var; ders açının SİNÜSÜNÜN genel bağıntısını yazıyor.
    // İkisi çelişmiyor, farklı büyüklükler. Eski kural "sol taraf içeriyorsa
    // aynıdır" dediği için sin φ' ile φ' aynı sayılıyor, katsayılar
    // tutmuyor ve ders reddediliyordu.
    //
    // Bedeli sessiz: taslak reddedilir, yeniden çizdirilir, üçü de düşerse
    // ders yedek yoldan — daha kötü hâliyle — yayına gider.
    const kaynak = ["φ' = arcsin 0,5 = 30°"];
    const ders = ["sin φ' = (σ' 1 − σ' 3) / (σ' 1 + σ' 3)"];
    expect(formulaMismatches(ders, kaynak)).toEqual([]);
  });

  it("still catches a rewritten coefficient for the same quantity", () => {
    // Gevşetme, modülün var oluş sebebini bozmasın: aynı sol taraf,
    // uydurulmuş katsayı — yakalanmalı.
    const kaynak = ["φ' = 30 * k + 12"];
    const ders = ["φ' = 77 * k + 48"];
    expect(formulaMismatches(ders, kaynak).length).toBeGreaterThan(0);
  });

  it("does not read a primed subscript as a coefficient", () => {
    // σ'₁ ve σ'₃ iki gerilmenin adı; oradaki 1 ile 3 formülü çarpmıyor.
    const kaynak = ["σ' 1 = σ' 3 + 40"];
    const ders = ["σ' 1 = σ' 3 + 40"];
    expect(formulaMismatches(ders, kaynak)).toEqual([]);
  });

  it("does not treat a symbolic quality relation as a mismatch against its numeric example", () => {
    const kaynak = ["v = v_f + x*v_fg = 0.001 + 0.80×1.67"];
    const ders = ["Karışımın hacmi v = v_f + x·v_fg bağıntısıyla yazılır."];
    expect(formulaMismatches(ders, kaynak)).toEqual([]);
  });

  it("still drops a structural coefficient the lesson left out", () => {
    const text =
      "Derinlikteki artış ayrı bir konudur. Δσ z = (Q/π) × (1/(1 + (z/R)²)) burada Q yüzeydeki yüktür. " +
      "Boşluk oranı e = Vv / Vs olarak tanımlanır.";
    const kept = withoutMismatchedFormulas(text, zeminSayfa12);
    expect(kept).not.toMatch(/Δσ/);
    expect(kept).toMatch(/Boşluk oranı/);
    expect(formulaMismatches([kept], zeminSayfa12)).toEqual([]);
  });

  it("tells the model both versions so it can fix itself", () => {
    const lesson = ["Δσ z = (Q/π) × (1/(1 + (z/R)²))"];
    const [message] = formulaFidelityIssues(lesson, zeminSayfa12);
    expect(message).toContain("Kaynakta:");
    expect(message).toContain("derste:");
  });
});
