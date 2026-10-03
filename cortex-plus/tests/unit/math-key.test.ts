import { describe, expect, it } from "vitest";
import { mathKeyWrong, mathOptionsAmbiguous } from "@/lib/learning/math-key";

describe("mathKeyWrong", () => {
  it("trigonometri anahtarını yakalar", () => {
    const check = { type: "mcq", prompt: "sin 30° değeri kaçtır?", options: ["1/2", "√3/2", "√2/2", "1"] };
    expect(mathKeyWrong({ ...check, answerIndex: 0 })).toBe(false);
    expect(mathKeyWrong({ ...check, answerIndex: 1 })).toBe(true);
  });

  it("ters yön: şıklar ifade, kök değer", () => {
    const check = {
      type: "mcq",
      prompt: "Aşağıdaki işlemlerden hangisinin sonucu 4³ tür?",
      options: ["4² × 4", "4³ ÷ 4", "4 × 4³", "4⁴ ÷ 4²"],
    };
    expect(mathKeyWrong({ ...check, answerIndex: 0 })).toBe(false);
    expect(mathKeyWrong({ ...check, answerIndex: 3 })).toBe(true);
  });

  it("doğru/yanlış iddiası", () => {
    const tf = { type: "trueFalse", options: ["Doğru", "Yanlış"] };
    expect(mathKeyWrong({ ...tf, prompt: "cos 60° = 1/2 eşitliği doğru mudur?", answerIndex: 0 })).toBe(false);
    expect(mathKeyWrong({ ...tf, prompt: "cos 60° = 1/2 eşitliği doğru mudur?", answerIndex: 1 })).toBe(true);
    expect(mathKeyWrong({ ...tf, prompt: "sin 30° = √3/2 ifadesi doğrudur.", answerIndex: 0 })).toBe(true);
  });

  it("sayısal cevap (birimli olanı da okur)", () => {
    expect(mathKeyWrong({ type: "numerical", prompt: "12 × 3 + 4 işleminin sonucu kaçtır?", answer: "40" })).toBe(false);
    expect(mathKeyWrong({ type: "numerical", prompt: "12 × 3 + 4 işleminin sonucu kaçtır?", answer: "44" })).toBe(true);
  });

  it("hesap parçası yoksa ya da ikiyse hüküm yok", () => {
    expect(mathKeyWrong({ type: "mcq", prompt: "Hangisi asal sayıdır?", options: ["4", "6", "7"], answerIndex: 2 })).toBeNull();
    expect(
      mathKeyWrong({ type: "mcq", prompt: "2 + 3 ile 4 × 2 toplamı nedir?", options: ["13", "5"], answerIndex: 0 }),
    ).toBeNull();
  });
});

describe("kırık parçaya hüküm yok", () => {
  it("şapkalı yazımda ortadaki parça ayrı hesap sanılmaz", () => {
    expect(mathKeyWrong({ type: "numerical", prompt: "2^3 · 2^2 ifadesinin değeri kaçtır?", answer: "32" })).toBe(false);
  });
});

/*
  Gerçek taslak taraması (29 Eylül, 430 soru / 1456 metin parçası) şu yanlış
  alarmları gösterdi; her biri burada bekçi.
*/
describe("taramada görülen yanlış alarmlar", () => {

  it("sözel problemde ipucu ya da tek başına kesir sorulan değer sayılmaz", () => {
    expect(
      mathKeyWrong({
        type: "mcq",
        prompt: "Bir kekin 3/4'ü yenmişse kaç kek kalır?",
        options: ["1/4", "3/4", "1/2", "1/3"],
        answerIndex: 0,
      }),
    ).toBeNull();
    expect(
      mathKeyWrong({
        type: "numerical",
        prompt: "Hipotenüsü 13 cm olan bir dik üçgende 60° açının karşısındaki kenar kaç cm? (sin 60° ≈ 0.866)",
        answer: "11.258",
      }),
    ).toBeNull();
  });

  it("taramada yakalanan gerçek hatalar yakalanmaya devam eder", () => {
    expect(
      mathKeyWrong({
        type: "mcq",
        prompt: "Hangisi 3⁴ × 3² çarpımının doğru üslü ifade halidir?",
        options: ["3⁶", "3⁸", "3⁴", "3²⁺²", "3⁷"],
        answerIndex: 1,
      }),
    ).toBe(true);
    expect(mathKeyWrong({ type: "numerical", prompt: "3² × 3⁵ ÷ 3³ işleminin sonucu kaçtır?", answer: "27" })).toBe(true);
  });
});

describe("aynı değerde iki şık", () => {
  it("iki doğru cevaplı soru belirsizdir", () => {
    expect(mathOptionsAmbiguous({ type: "mcq", prompt: "sin A kaçtır?", options: ["3/5", "4/5", "6/10", "3/4"] })).toBe(true);
    expect(mathOptionsAmbiguous({ type: "mcq", prompt: "3⁶ kaçtır?", options: ["3⁶", "729", "18"] })).toBe(true);
    expect(mathOptionsAmbiguous({ type: "mcq", prompt: "3⁴ × 3² kaçtır?", options: ["3⁶", "3⁸", "9⁶"] })).toBe(false);
    expect(mathOptionsAmbiguous({ type: "mcq", prompt: "Hangisi?", options: ["taban", "üs"] })).toBe(false);
  });
});

/*
  Canlı düelloda "kosinüs değeri 0 olan açı" sorusunda 90° ve 270° birlikte
  şıktı (30 Eylül 2026). Şıklar açıysa her şıkkın değeri hesaplanır.
*/
describe("ters trigonometri: değeri verilen açı", () => {
  const mcq = (prompt: string, options: string[], answerIndex: number) => ({ type: "mcq", prompt, options, answerIndex });

  it("iki şık koşulu sağlıyorsa soru belirsizdir", () => {
    expect(mathOptionsAmbiguous(mcq("Birim çemberde kosinüs değeri 0 olan açı kaç derecedir?", ["90°", "0°", "180°", "270°"], 0))).toBe(true);
    expect(mathOptionsAmbiguous(mcq("sin x = 1/2 olan açı hangisidir?", ["30°", "150°", "60°", "90°"], 0))).toBe(true);
    expect(mathOptionsAmbiguous(mcq("Birim çemberde kosinüs değeri -1 olan açı kaç derecedir?", ["180°", "0°", "90°", "270°"], 0))).toBe(false);
  });

  it("tek şık tutuyorsa anahtar ona göre denetlenir", () => {
    expect(mathKeyWrong(mcq("Birim çemberde kosinüs değeri -1 olan açı kaç derecedir?", ["180°", "0°", "90°", "270°"], 0))).toBe(false);
    expect(mathKeyWrong(mcq("Birim çemberde kosinüs değeri -1 olan açı kaç derecedir?", ["180°", "0°", "90°", "270°"], 1))).toBe(true);
    expect(mathKeyWrong(mcq("sin x = -1 olan açı hangisidir?", ["3π/2", "π/2", "π", "0°"], 0))).toBe(false);
    expect(mathKeyWrong(mcq("sin x = √3/2 olan açı hangisidir?", ["60°", "30°", "90°", "180°"], 1))).toBe(true);
  });

  it("kökteki aralık yalnızca aralıktaki şıkları sayar", () => {
    // Canlıda: 240° ve 300° ikisi de [0°, 360°) içinde ve ikisi de −√3/2.
    expect(mathOptionsAmbiguous(mcq("Birim çemberde sinüs değeri -√3/2 olan açı kaçtır (0° ≤ x < 360°)?", ["240°", "120°", "300°", "60°"], 0))).toBe(true);
    // 270° aralığın dışında: tek doğru 90°.
    expect(mathOptionsAmbiguous(mcq("0° ile 180° arasında kosinüs değeri 0 olan açı hangisidir?", ["90°", "0°", "180°", "270°"], 0))).toBe(false);
    expect(mathKeyWrong(mcq("0° ile 180° arasında kosinüs değeri 0 olan açı hangisidir?", ["90°", "0°", "180°", "270°"], 0))).toBe(false);
    expect(mathKeyWrong(mcq("0° ile 180° arasında kosinüs değeri 0 olan açı hangisidir?", ["90°", "0°", "180°", "270°"], 1))).toBe(true);
    // Açık uç: π dışarıda kalır, tek doğru 0.
    expect(mathOptionsAmbiguous(mcq("sin x = 0 olan açı hangisidir, x ∈ [0, π)?", ["0°", "π", "π/2", "3π/2"], 0))).toBe(false);
    // "arasında" uçları belirsiz bırakır: 0° ve 180° ikisi de sayılır.
    expect(mathOptionsAmbiguous(mcq("0° ile 180° arasında sinüs değeri 0 olan açı hangisidir?", ["0°", "180°", "90°", "45°"], 0))).toBe(true);
  });

  it("çok fonksiyon, okunamayan aralık ya da açı olmayan şıkta hüküm yok", () => {
    expect(mathOptionsAmbiguous(mcq("0 ile 7 arasında kosinüs değeri 0 olan açı hangisidir?", ["90°", "270°", "180°", "0°"], 0))).toBe(false);
    expect(mathOptionsAmbiguous(mcq("sin x = cos x olan açı hangisidir?", ["45°", "225°", "90°", "0°"], 0))).toBe(false);
    expect(mathOptionsAmbiguous(mcq("cos(θ) = 0 eşitliği hangi açılar için doğrudur?", ["π/2 ve 3π/2", "0 ve π", "π ve 2π", "0 ve 2π"], 0))).toBe(false);
    // Derece mi radyan mı yazılmamış açıya hüküm yok.
    expect(mathOptionsAmbiguous(mcq("Kosinüs değeri 0 olan açı hangisidir?", ["90", "0", "180", "270"], 0))).toBe(false);
  });

  it("değer soran düz soru etkilenmez", () => {
    expect(mathKeyWrong(mcq("Birim çemberde 90° açısının kosinüs değeri kaçtır?", ["0", "1", "-1", "√2/2"], 0))).not.toBe(true);
    expect(mathOptionsAmbiguous(mcq("Birim çemberde 90° açısının kosinüs değeri kaçtır?", ["0", "1", "-1", "√2/2"], 0))).toBe(false);
  });
});
