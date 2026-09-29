import { describe, expect, it } from "vitest";
import { evaluatePowerChain, exponentKeyWrong } from "@/lib/learning/exponent-key";
import { publishLessonDraft } from "@/lib/learning/teaching-standards";

/*
  29 Eylül 2026, canlı belgesiz "Üslü Sayılar" dersi: çoktan seçmeli soru
  "(3⁴)²" için 3¹²'yi doğru saydı ("4 ile 2 üs olarak çarpılır"). Öğrenci
  3⁸'i seçse yanlış sayılacaktı. Bu denetçi yalnızca kesin hesaplanan
  aynı tabanlı üslü işleme hüküm verir; okuyamadığına dokunmaz.
*/

describe("evaluatePowerChain", () => {
  it("aynı tabanlı çarpma, bölme ve üssün üssü", () => {
    expect(evaluatePowerChain("3² × 3³")).toEqual({ base: 3, exp: 5 });
    expect(evaluatePowerChain("2³ ÷ 2⁵")).toEqual({ base: 2, exp: -2 });
    expect(evaluatePowerChain("(3⁴)²")).toEqual({ base: 3, exp: 8 });
    expect(evaluatePowerChain("2³ × 2⁴ ÷ 2²")).toEqual({ base: 2, exp: 5 });
  });

  it("farklı taban ya da okunamayan ifade hüküm vermez", () => {
    expect(evaluatePowerChain("2³ × 3²")).toBeNull();
    expect(evaluatePowerChain("aᵐ × aⁿ")).toBeNull();
  });
});

describe("exponentKeyWrong", () => {
  const mcq = {
    type: "mcq",
    prompt: "Hangisi (3⁴)² ifadesinin doğru sonucudur?",
    options: ["3⁶", "3⁸", "3¹²", "3²⁴"],
  };

  it("canlıdaki yanlış anahtarı yakalar", () => {
    expect(exponentKeyWrong({ ...mcq, answerIndex: 2 })).toBe(true);
    expect(exponentKeyWrong({ ...mcq, answerIndex: 1 })).toBe(false);
  });

  it("şık sayı olarak yazılmışsa değeri karşılaştırır", () => {
    const numeric = { type: "mcq", prompt: "2³ × 2² işleminin sonucu kaçtır?", options: ["32", "64", "10"] };
    expect(exponentKeyWrong({ ...numeric, answerIndex: 0 })).toBe(false);
    expect(exponentKeyWrong({ ...numeric, answerIndex: 1 })).toBe(true);
  });

  it("doğru/yanlış iddiasını hesapla karşılaştırır", () => {
    const tf = { type: "trueFalse", prompt: "2³ ÷ 2² = 2⁵ işlemi doğrudur.", options: ["Doğru", "Yanlış"] };
    expect(exponentKeyWrong({ ...tf, answerIndex: 1 })).toBe(false);
    expect(exponentKeyWrong({ ...tf, answerIndex: 0 })).toBe(true);
  });

  it("sayısal cevabı karşılaştırır", () => {
    const numerical = { type: "numerical", prompt: "(2³)² işleminin sonucu kaçtır?" };
    expect(exponentKeyWrong({ ...numerical, answer: "64" })).toBe(false);
    expect(exponentKeyWrong({ ...numerical, answer: "2⁶" })).toBe(false);
    expect(exponentKeyWrong({ ...numerical, answer: "32" })).toBe(true);
  });

  it("hesaplanamayan soruya hüküm vermez", () => {
    expect(exponentKeyWrong({ type: "mcq", prompt: "Üslü sayının tabanı nedir?", options: ["a", "n"], answerIndex: 0 })).toBeNull();
    // İki ayrı ifade: hangisinin sorulduğu belirsiz.
    expect(
      exponentKeyWrong({ type: "mcq", prompt: "2³ × 2² ile 3² × 3⁴ işlemlerini karşılaştır", options: ["2⁵", "3⁶"], answerIndex: 0 }),
    ).toBeNull();
  });
});

describe("yayın kapısı yanlış anahtarlı soruyu geri koymaz", () => {
  it("tek soru bile olsa yanlış anahtar düşer", () => {
    const lesson = publishLessonDraft({
      title: "Üslü Sayılar",
      sections: [
        {
          heading: "Üssün Üssü",
          body: "**Üssün üssü** alınırken üsler çarpılır: (aᵐ)ⁿ ifadesinde üs m ile n'nin çarpımıdır.",
          check: {
            type: "mcq",
            prompt: "Hangisi (3⁴)² ifadesinin doğru sonucudur?",
            options: ["3⁶", "3⁸", "3¹²", "3²⁴"],
            answerIndex: 2,
            explanation: "3¹² doğru, 4 ile 2 üs olarak çarpılır ve sonuç bulunur.",
          },
        },
        {
          heading: "Üslü Sayılarda Çarpma",
          body: "Tabanlar **aynıysa** çarpma işleminde üsler toplanır: 2³ × 2⁴ = 2⁷ olur.",
          check: {
            type: "trueFalse",
            prompt: "2³ × 2⁴ = 2⁷ eşitliği doğru mudur?",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Çarpmada üsler toplanır: 3 + 4 = 7 olduğundan eşitlik doğrudur.",
          },
        },
      ],
    })!;
    expect(lesson.sections[0].check).toBeUndefined();
    expect(lesson.sections[1].check?.type).toBe("trueFalse");
  });
});
