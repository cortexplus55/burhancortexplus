import { describe, expect, it } from "vitest";
import { optionReasonRestates } from "@/lib/learning/restated-option-reason";

/*
  30 Eylül 2026 canlı quiz (birim çember, deneme 43dd3046): altı yanlış şık
  gerekçesinin beşi şıkkı tekrar edip "olamaz / değildir" diyordu. Satırlar
  birebir oradan.
*/
const Q90 = "Birim çemberde 90° açısına karşılık gelen noktaların koordinatları nedir?";
const Q45 = "Birim çemberde 45° açısının koordinatları nedir?";
const QRANGE =
  "Açıları 0° ile 90° arasında olan birim çember noktasının koordinatları hangi aralıklarla değişir?";

describe("şıkkı tekrar eden gerekçe", () => {
  it("canlı quizdeki tekrar satırlarını yakalar", () => {
    expect(
      optionReasonRestates(
        "Bu şık yanlıştır, çünkü 90° açısının noktaları (√2/2, √2/2) olamaz.",
        "(√2/2, √2/2)",
        Q90,
      ),
    ).toBe(true);
    expect(optionReasonRestates("Bu şık yanlıştır; koordinatlar (1, 1) olamaz.", "(1, 1)", Q90)).toBe(true);
    expect(optionReasonRestates("Bu şık yanlıştır; 45° açısındaki nokta (1, 0) değildir.", "(1, 0)", Q45)).toBe(true);
    expect(
      optionReasonRestates("Bu şık yanlıştır; (1/2, √3/2) noktaları 45°'ye karşılık gelmez.", "(1/2, √3/2)", Q45),
    ).toBe(true);
    expect(
      optionReasonRestates(
        "Bu şık yanlıştır; bu noktalar 0° ile 90° arasında geçerli değildir.",
        "(1, 0) ve (0, 1) arasında",
        QRANGE,
      ),
    ).toBe(true);
    expect(
      optionReasonRestates(
        "Bu şık yanlıştır; (0, 1) ve (1, 0) noktaları bu açılar arasında değil.",
        "(0, 1) ve (1, 0) arasında",
        QRANGE,
      ),
    ).toBe(true);
  });

  it("aynı quizde bir şey söyleyen satırları geçirir", () => {
    expect(
      optionReasonRestates("Bu şık yanlıştır; 90° açısının yatay koordinatı 0'dır, 1 değildir.", "(1, 0)", Q90),
    ).toBe(false);
    expect(
      optionReasonRestates("Bu şık yanlıştır; 45° için düşey koordinat 1 değil, √2/2'dir.", "(0, 1)", Q45),
    ).toBe(false);
    expect(
      optionReasonRestates(
        "Bu şık yanlış; noktalar (sin A, cos A) olarak değil, (cos A, sin A) şeklinde tanımlanır.",
        "(sin A, cos A) değerleri arasında",
        QRANGE,
      ),
    ).toBe(false);
  });

  it("sınıflandırma, çember dışı gerekçe ve eşitlik tekrar sayılmaz", () => {
    const radian = "Bir açının ölçüsünü radyanda ifade etmek için hangi değer kullanılır?";
    expect(optionReasonRestates("Daire çapı bir açı ölçüsü değildir.", "Daire çapı", radian)).toBe(false);
    expect(optionReasonRestates("(1, 1) birim çemberin üzerinde değildir.", "(1, 1)", Q90)).toBe(false);
    expect(optionReasonRestates("Bu şık yanlış; 3⁴ × 3² = 3⁶ olur, 3⁸ değil.", "3⁸", "3⁴ × 3² kaçtır?")).toBe(false);
    expect(optionReasonRestates("Al yanlıştır; tuzak: oran karıştırmak.", "Al", "Sınırlayıcı bileşen hangisidir?")).toBe(
      false,
    );
  });

  /*
    Canlı taramada (30 Eylül, 184 soru) kısa ve olumsuz olup yine de bir şey
    söyleyen satırlar. Hiçbiri tekrar sayılmamalı.
  */
  it("taramada görülen kısa olumsuz gerekçeleri geçirir", () => {
    const growth = "Bebeklerde büyümenin izlenmesinde baş çevresi neyi gösterir?";
    expect(optionReasonRestates("Duyu gelişimi baş çevresiyle ilişkili değildir.", "Duyu gelişimi", growth)).toBe(false);
    expect(
      optionReasonRestates("Kilo artışını ölçmek için baş çevresi yeterli değildir.", "Kilo artışı", growth),
    ).toBe(false);
    expect(
      optionReasonRestates("Yanlıştır çünkü çarpma işlemi doğru değil.", "2 × 8", "8²'nin değeri nasıl bulunur?"),
    ).toBe(false);
    expect(
      optionReasonRestates(
        "Bu açı ölçüsüyle ilgili bir hesaplama değildir.",
        "1/180",
        "Dereceyi radyana çevirmek için hangi oran kullanılır?",
      ),
    ).toBe(false);
  });

  it("olumsuzlama yoksa hüküm yok", () => {
    expect(optionReasonRestates("Bu şık 90° açısının noktası (0, 1).", "(0, 1)", Q90)).toBe(false);
  });
});
