import { describe, expect, it } from "vitest";
import { evaluateMath, mathKeyWrong, mathOptionsAmbiguous, mathProseWrong } from "@/lib/learning/math-key";

/*
  exponent-key.ts yalnızca aynı tabanlı üslü işleme bakıyor. Trigonometri,
  kesir ve düz aritmetikte aynı tür yanlış anahtar ("sin 30° = √3/2")
  denetimsizdi. Test belgesi trigonometri (uat_99_sayfa_trigonometri.pdf).
*/

describe("evaluateMath", () => {
  it("dört işlem, parantez, üs, kök, π", () => {
    expect(evaluateMath("2 × (3 + 4)")).toBe(14);
    expect(evaluateMath("3² × 3³")).toBe(243);
    expect(evaluateMath("(3²)⁴")).toBe(6561);
    expect(evaluateMath("3²ˣ⁴")).toBe(6561);
    expect(evaluateMath("0,25 × 8")).toBe(2);
    expect(evaluateMath("√16 ÷ 2")).toBe(2);
    expect(evaluateMath("12 − 5")).toBe(7);
  });

  it("özel açılar: derece ya da π ile", () => {
    expect(evaluateMath("sin 30°")).toBeCloseTo(0.5);
    expect(evaluateMath("cos 60°")).toBeCloseTo(0.5);
    expect(evaluateMath("tan 45°")).toBeCloseTo(1);
    expect(evaluateMath("sin(π/6)")).toBeCloseTo(0.5);
    expect(evaluateMath("√3/2")).toBeCloseTo(Math.sqrt(3) / 2);
  });

  it("belirsiz ya da harfli ifadeye hüküm yok", () => {
    expect(evaluateMath("sin 30")).toBeNull();
    expect(evaluateMath("tan 90°")).toBeNull();
    expect(evaluateMath("aᵐ × aⁿ")).toBeNull();
    expect(evaluateMath("2 kg")).toBeNull();
    expect(evaluateMath("25 °C")).toBeNull();
  });
});

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

describe("mathProseWrong", () => {
  it("yanlış trigonometri ve aritmetik eşitliği yakalar", () => {
    expect(mathProseWrong("Özel açılarda sin 30° = √3/2 olur.")).toBe(true);
    expect(mathProseWrong("Toplam 9 + 27 = 35 eder.")).toBe(true);
  });

  it("doğru eşitlikleri ve dönüşümleri geçirir", () => {
    expect(mathProseWrong("Özel açılarda sin 30° = 1/2 ve cos 60° = 1/2 olur.")).toBe(false);
    expect(mathProseWrong("180° = π radyandır; 90° = π/2 olur.")).toBe(false);
    expect(mathProseWrong("3² + 3³ = 9 + 27 = 36 eder.")).toBe(false);
  });

  it("birimli nicelik ve bitişik olmayan sayıya hüküm vermez", () => {
    expect(mathProseWrong("1 kg = 1000 g eder.")).toBe(false);
    expect(mathProseWrong("m = 2 kg; Q = 2 × 0,25 × 10 = 5 kJ bulunur.")).toBe(false);
    expect(mathProseWrong("%50 = 0,5 demektir.")).toBe(false);
  });

  it("yanlışı anan cümleye hüküm vermez", () => {
    expect(mathProseWrong("sin 30° = √3/2 yazmak sık yapılan bir hatadır.")).toBe(false);
  });
});

describe("kırık parçaya hüküm yok", () => {
  it("şapkalı yazımda ortadaki parça ayrı hesap sanılmaz", () => {
    expect(mathKeyWrong({ type: "numerical", prompt: "2^3 · 2^2 ifadesinin değeri kaçtır?", answer: "32" })).toBe(false);
  });
  it("kelime içindeki 'sin' fonksiyon sayılmaz, harfe bitişik sayı eşitliği okunmaz", () => {
    expect(mathProseWrong("Bu sonuç kesin 3 × 2 = 6 olur.")).toBe(false);
    expect(mathProseWrong("x2 = 5 yazılırsa")).toBe(false);
  });
});

/*
  Gerçek taslak taraması (29 Eylül, 430 soru / 1456 metin parçası) şu yanlış
  alarmları gösterdi; her biri burada bekçi.
*/
describe("taramada görülen yanlış alarmlar", () => {
  it("bitişik kesir işlemden önce hesaplanır", () => {
    expect(mathKeyWrong({ type: "numerical", prompt: "3/4 ÷ 2/5 işleminin sonucu nedir?", answer: "15/8" })).toBe(false);
    expect(mathProseWrong("Bölme, ikinci kesrin tersini çarpmak demektir; 1/2 × 4/3 = 4/6 = 2/3.")).toBe(false);
  });

  it("'2π' tek sayıdır, derece yazımı iki türlü okunur, ondalık yuvarlanır", () => {
    expect(mathProseWrong("π × 360 ÷ 2π = 180° eder.")).toBe(false);
    expect(mathProseWrong("1 × 180 / π = 57.2958° olarak hesaplanır.")).toBe(false);
  });

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
