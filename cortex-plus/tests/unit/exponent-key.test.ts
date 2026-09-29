import { describe, expect, it } from "vitest";
import { evaluatePowerChain, exponentKeyWrong, exponentProseWrong } from "@/lib/learning/exponent-key";
import { finishTaughtLesson } from "@/lib/learning/lesson-teach";
import { gradeNumericalAnswer } from "@/lib/learning/lesson-play";
import { normalizeSummaryText } from "@/lib/learning/lesson-grounding";
import { publishLessonDraft, type LessonV2 } from "@/lib/learning/teaching-standards";

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

/*
  Aynı canlı derste sık hata kartı "Doğrusu: (3²)⁴ = 3²ˣ⁴ = 3¹²" dedi —
  doğrusu 3⁸. Kart düz metin olduğu için anahtar denetimi görmüyordu.
*/
describe("exponentProseWrong", () => {
  it("canlıdaki yanlış eşitlik zincirini yakalar", () => {
    expect(exponentProseWrong("Üssün üssü alınırken üsler çarpılır; (3²)⁴ = 3²ˣ⁴ = 3¹² olur.")).toBe(true);
  });

  it("doğru zincirleri geçirir; üs içindeki işlemi hesaplar", () => {
    expect(exponentProseWrong("(3²)⁴ = 3²ˣ⁴ = 3⁸ olur.")).toBe(false);
    expect(exponentProseWrong("3¹⁶ ÷ 3⁵ = 3¹⁶⁻⁵ = 3¹¹ bulunur.")).toBe(false);
    expect(exponentProseWrong("3⁴ × 3⁻² = 3⁴⁺⁻² = 3² = 9 olur.")).toBe(false);
    expect(exponentProseWrong("(3²)³ = 3²ˣ³ = 3⁶ = 729 eder.")).toBe(false);
  });

  it("yanlış sonuçlu sayıyı da yakalar", () => {
    expect(exponentProseWrong("(3²)³ = 3⁶ = 728 eder.")).toBe(true);
  });

  it("yanlışı anan cümleye hüküm vermez", () => {
    expect(exponentProseWrong("2³ × 2⁴ = 2¹² değildir; üsler toplanır.")).toBe(false);
    expect(exponentProseWrong("Sık yapılan hata 2³ × 2⁴ = 2¹² yazmaktır.")).toBe(false);
  });

  it("harfli ve kesirli ifadelere karışmaz", () => {
    expect(exponentProseWrong("aᵐ × aⁿ = aᵐ⁺ⁿ kuralı geçerlidir.")).toBe(false);
    expect(exponentProseWrong("5⁻² = 1/25 olur.")).toBe(false);
  });
});

describe("ders çıktısında yanlış hesap taşıyan parça atılır", () => {
  it("sık hata kartının 'doğrusu' yanlışsa kart gider, doğruysa kalır", async () => {
    const base: LessonV2 = {
      title: "Üslü Sayılar",
      overview: "Üslü sayılarda işlem kurallarını öğreneceğiz.",
      sections: [
        {
          heading: "Üssün Üssü",
          body: "**Üssün üssü** alınırken üsler çarpılır. Örneğin (2³)² = 2⁶ olur.",
          check: {
            type: "mcq",
            prompt: "Hangisi (3⁴)² ifadesinin doğru sonucudur?",
            options: ["3⁶", "3⁸", "3¹²", "3²⁴"],
            answerIndex: 1,
            explanation: "Üssün üssünde üsler çarpılır: 4 × 2 = 8, sonuç 3⁸ olur.",
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
      commonMistake: {
        claim: "(3²)⁴ ifadesi 3¹²⁺⁴ olarak hesaplanır.",
        correction: "Üssün üssü alınırken üsler çarpılır; (3²)⁴ = 3²ˣ⁴ = 3¹² olur.",
      },
    };
    const wrong = await finishTaughtLesson(base, { source: "", topicLabel: "Üslü Sayılar" });
    expect(wrong.lesson.commonMistake).toBeUndefined();
    const right = await finishTaughtLesson(
      { ...base, commonMistake: { ...base.commonMistake!, correction: "Üssün üssü alınırken üsler çarpılır; (3²)⁴ = 3²ˣ⁴ = 3⁸ olur." } },
      { source: "", topicLabel: "Üslü Sayılar" },
    );
    expect(right.lesson.commonMistake?.correction).toContain("3⁸");
  });
});

/*
  Canlı derste sayısal sorunun beklenen cevabı "8³" idi; değeri hesaplayıp
  "512" yazan öğrenci yanlış sayıldı.
*/
describe("üslü sayısal cevap notlandırması", () => {
  it("üslü yazım ile değer aynı cevaptır", () => {
    expect(gradeNumericalAnswer("512", "8³")).toMatchObject({ correct: true, message: "Doğru — 8³ = 512" });
    expect(gradeNumericalAnswer("8³", "8³").correct).toBe(true);
    expect(gradeNumericalAnswer("64", "2⁶").correct).toBe(true);
    expect(gradeNumericalAnswer("8³", "512").correct).toBe(true);
  });

  it("yanlış değer yanlıştır; birimli fizik cevabı eskisi gibi notlanır", () => {
    expect(gradeNumericalAnswer("511", "8³")).toMatchObject({ correct: false, message: "Doğrusu 8³ = 512" });
    expect(gradeNumericalAnswer("13,6", "13,6 g")).toMatchObject({ half: true });
    expect(gradeNumericalAnswer("13,6 g", "13,6 g").correct).toBe(true);
  });
});

describe("özette tek yıldızlı vurgu", () => {
  it("'*üs*' çarpıya dönmez, koyu vurgu olur; gerçek çarpı yine noktaya döner", () => {
    expect(normalizeSummaryText("Bir *üs*, çarpım sayısını gösterir.")).toBe("Bir **üs**, çarpım sayısını gösterir.");
    expect(normalizeSummaryText("Alan = a * b olur.")).toBe("Alan = a · b olur.");
  });
});
