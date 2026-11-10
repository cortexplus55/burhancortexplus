import { describe, expect, it } from "vitest";
import { adjustScoredAnswer, answerReachesExpected } from "@/lib/learning/mock-exam/grade";
import { allValuesIn, matchesExpected, modelResult } from "@/lib/learning/result-values";

/*
  10 Kasım 2026: canlı bir yazılı denemede doğru oranı kesirle ve ondalıkla yazan açık uçlu cevap, metindeki ara
  işlem sayıları yüzünden "Sonuç beklenen değerle çelişiyor" diye 0 aldı. Kural: cevaptaki sayılardan en az biri
  beklenen değeri tutuyorsa öbür sayılar çelişki sayılmaz. Örnekler farklı derslerden ve nötr sayılarla.
*/

describe("sayı okuma: kesir, ondalık, binlik", () => {
  it("kesir bölümü, ondalık virgül ve binlik nokta aynı değere iner", () => {
    expect(allValuesIn("Oran 18/12 olur")).toContain(1.5);
    expect(allValuesIn("Sonuç 1,5 kat")).toContain(1.5);
    expect(allValuesIn("Toplam 24.000 TL, taksit 3.000 TL")).toEqual(expect.arrayContaining([24000, 3000]));
    expect(allValuesIn("x = 9/6 = 3/2")).toContain(1.5);
  });

  it("yuvarlama eşdeğerliği: beklenenin öğrencinin basamağına yuvarlanmışı tutar; küçük sayıda kaba hata tutmaz", () => {
    expect(matchesExpected(0.33, 1 / 3)).toBe(true);
    expect(matchesExpected(0.13, 0.125)).toBe(true);
    expect(matchesExpected(0.06, 0.05)).toBe(false);
    expect(matchesExpected(2, 1.5)).toBe(false);
    expect(matchesExpected(1.5, 1.5)).toBe(true);
  });

  it("örnek cevabın sonucu son eşitlik zincirinden okunur; sonraki yorum cümlesinin sayısı beklenen sayılmaz", () => {
    expect(modelResult("18/12 = 3/2 = 1,5; yani ilk değer ikinciden %50 büyüktür.")).toBe(1.5);
    expect(modelResult("Alan = 6 · 7 = 42 cm². Kenarlar 6 ve 7 birimdir.")).toBe(42);
    expect(modelResult("Yalnız sözel bir açıklama.")).toBeNull();
  });
});

describe("açık uçlu cevap: tutan tek sayı çelişkiyi düşürür", () => {
  const model = "18/12 = 3/2 = 1,5; yani ilk değer ikinciden %50 büyüktür.";
  const criteria = ["İki değerin oranını kurar", "Oranı yorumlar"];

  it("kesir + ondalık + ara işlem sayıları: sıfırlanmaz, tam puan", () => {
    const tuned = adjustScoredAnswer({
      answer: "İlk değer 18, ikincisi 12. Oran 18/12 = 1,5 çıkar. Yani ilki ikincinin 1,5 katıdır; 18 birime karşı 12 birim.",
      expected: null,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 8,
    });
    expect(tuned.step).not.toBe("Sonuç beklenen değerle çelişiyor.");
    expect(tuned.earned).toBe(10);
  });

  it("sonucu yalnız kesirle yazan cevap da beklenen değere ulaşmış sayılır", () => {
    expect(answerReachesExpected({ answer: "Oran 9/6'dır, yani ilk değer daha büyük.", expected: 1.5 })).toBe(true);
    const tuned = adjustScoredAnswer({
      answer: "İki değeri bölerim: oran 9/6 olur, ilk değer ikinciden büyüktür.",
      expected: 1.5,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 7,
    });
    expect(tuned.earned).toBeGreaterThanOrEqual(7);
    expect(tuned.step).not.toBe("Sonuç beklenen değerle çelişiyor.");
  });

  it("binlik noktalı sonuç ondalık sanılmaz", () => {
    const tuned = adjustScoredAnswer({
      answer: "Toplam borç 24.000 TL, 8 taksit var. Taksit = 24.000 / 8 = 3.000 TL.",
      expected: 3000,
      maxPoints: 10,
      modelAnswer: "Taksit = 24.000 / 8 = 3.000 TL",
      criteria: ["Toplamı taksit sayısına böler"],
      earned: 7,
    });
    expect(tuned.earned).toBe(10);
  });

  it("denetçi düşük puan verdiyse tutan bir sayı tek başına tam puan getirmez", () => {
    const tuned = adjustScoredAnswer({
      answer: "Verilenler 18 ve 12; 1,5 de olabilir ama ben oranı 12/18 = 0,67 buldum.",
      expected: 1.5,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 2,
    });
    expect(tuned.earned).toBeLessThan(10);
  });

  it("hiçbir sayı tutmuyorsa çelişki kuralı aynen çalışır", () => {
    const tuned = adjustScoredAnswer({
      answer: "Sonuç 4 çıkar, ilk değer ikincinin 4 katıdır.",
      expected: 1.5,
      maxPoints: 10,
      modelAnswer: "Sözel yorum; oran 1,5.",
      criteria: [],
      earned: 8,
    });
    expect(tuned).toEqual({ earned: 0, step: "Sonuç beklenen değerle çelişiyor." });
  });
});
