import { describe, expect, it } from "vitest";
import {
  askedUnitAngle,
  parsePoint,
  pointAngle,
  unitCircleClaimIssues,
  unitCircleKeyWrong,
  unitCircleOptionReason,
} from "@/lib/learning/unit-circle";

/*
  30 Eylül 2026 canlı quiz (birim çember, deneme 43dd3046). Metinler birebir
  oradan; öğrenci aynı iki noktayı yazan şıklardan birini seçip yanlış sayıldı.
*/
const Q90 = {
  text: "Birim çemberde 90° açısına karşılık gelen noktaların koordinatları nedir?",
  options: ["(0, 1)", "(1, 0)", "(√2/2, √2/2)", "(1, 1)"],
  correct: ["(0, 1)"],
  explanation:
    "Birim çemberde 90° açısının yatay koordinatı 0, düşey koordinatı ise 1'dir. Bu nedenle doğru cevap (0, 1) koordinatıdır.",
  optionWhy: [
    "Bu doğru; 90° açısının koordinatları kesin olarak (0, 1)dir.",
    "Bu şık yanlıştır; 90° açısının yatay koordinatı 0'dır, 1 değildir.",
    "Bu şık yanlıştır, çünkü 90° açısının noktaları (√2/2, √2/2) olamaz.",
    "Bu şık yanlıştır; koordinatlar (1, 1) olamaz.",
  ],
};

const QRANGE = {
  text: "Açıları 0° ile 90° arasında olan birim çember noktasının koordinatları hangi aralıklarla değişir?",
  options: [
    "(cos A, sin A) değerleri arasında",
    "(sin A, cos A) değerleri arasında",
    "(1, 0) ve (0, 1) arasında",
    "(0, 1) ve (1, 0) arasında",
  ],
  correct: ["(cos A, sin A) değerleri arasında"],
  explanation:
    "Birim çemberde açılara karşılık gelen noktaların koordinatları hep (kosinüs, sinüs) şeklindedir; bu nedenle (cos A, sin A) aralığı doğrudur.",
  optionWhy: [
    "Bu doğru; birim çemberde koordinatlar (cos A, sin A) ile belirlenir.",
    "Bu şık yanlış; noktalar (sin A, cos A) olarak değil, (cos A, sin A) şeklinde tanımlanır.",
    "Bu şık yanlıştır; bu noktalar 0° ile 90° arasında geçerli değildir.",
    "Bu şık yanlıştır; (0, 1) ve (1, 0) noktaları bu açılar arasında değil.",
  ],
};

const Q45 = {
  text: "Birim çemberde 45° açısının koordinatları nedir?",
  options: ["(√2/2, √2/2)", "(1, 0)", "(0, 1)", "(1/2, √3/2)"],
  correct: ["(√2/2, √2/2)"],
  explanation:
    "Birim çemberde 45° açısının hem yatay hem de düşey koordinatı √2/2'dir, bu nedenle doğru yanıt (√2/2, √2/2) şeklindedir.",
  optionWhy: [
    "Bu doğru; 45° açısının hem sinüsü hem de kosinüsü √2/2'dir.",
    "Bu şık yanlıştır; 45° açısındaki nokta (1, 0) değildir.",
    "Bu şık yanlıştır; 45° için düşey koordinat 1 değil, √2/2'dir.",
    "Bu şık yanlıştır; (1/2, √3/2) noktaları 45°'ye karşılık gelmez.",
  ],
};

describe("nokta ve açı okuma", () => {
  it("özel açıların noktaları", () => {
    expect(pointAngle(parsePoint("(1, 0)")!)).toBe(0);
    expect(pointAngle(parsePoint("(0, 1)")!)).toBe(90);
    expect(pointAngle(parsePoint("(√2/2, √2/2)")!)).toBe(45);
    expect(pointAngle(parsePoint("(1/2, √3/2)")!)).toBe(60);
    expect(pointAngle(parsePoint("(−1/2, √3/2)")!)).toBe(120);
    expect(pointAngle(parsePoint("(0, -1)")!)).toBe(270);
    expect(pointAngle(parsePoint("(1, 1)")!)).toBeNull();
    expect(parsePoint("(cos A, sin A)")).toBeNull();
  });

  it("kök tek açının noktasını soruyorsa açıyı verir", () => {
    expect(askedUnitAngle(Q90.text)).toBe(90);
    expect(askedUnitAngle(Q45.text)).toBe(45);
    expect(askedUnitAngle(QRANGE.text)).toBeNull();
    expect(askedUnitAngle("Birim çemberde 90° açısının orijine göre simetriği olan nokta hangisidir?")).toBeNull();
    expect(askedUnitAngle("45° açısının koordinatları nedir?")).toBeNull();
  });
});

describe("unitCircleKeyWrong", () => {
  it("canlı soruların anahtarı doğru", () => {
    expect(unitCircleKeyWrong({ prompt: Q90.text, options: Q90.options, answerIndex: 0 })).toBe(false);
    expect(unitCircleKeyWrong({ prompt: Q45.text, options: Q45.options, answerIndex: 0 })).toBe(false);
  });

  it("yanlış anahtarı ve doğru noktası olmayan şıkları yakalar", () => {
    expect(unitCircleKeyWrong({ prompt: Q90.text, options: Q90.options, answerIndex: 1 })).toBe(true);
    expect(
      unitCircleKeyWrong({ prompt: Q90.text, options: ["(1, 0)", "(√2/2, √2/2)", "(1, 1)"], answerIndex: 0 }),
    ).toBe(true);
  });

  it("şıklar nokta değilse ya da kök aralık soruyorsa hüküm yok", () => {
    expect(unitCircleKeyWrong({ prompt: QRANGE.text, options: QRANGE.options, answerIndex: 0 })).toBeNull();
    expect(
      unitCircleKeyWrong({
        prompt: "Birim çemberde 30° açısının noktasının yatay koordinatı nedir?",
        options: ["√3/2", "1/2"],
        answerIndex: 0,
      }),
    ).toBeNull();
  });
});

describe("unitCircleClaimIssues", () => {
  it("(1, 0) ve (0, 1) noktalarını 0°–90° dışında sayan gerekçeleri yakalar", () => {
    const issues = unitCircleClaimIssues(QRANGE);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^\(1, 0\) ve \(0, 1\) arasında:/);
    expect(issues[1]).toMatch(/^\(0, 1\) ve \(1, 0\) arasında:/);
  });

  it("doğru iddiaları ve doğru reddi geçirir", () => {
    expect(unitCircleClaimIssues(Q90)).toEqual([]);
    expect(unitCircleClaimIssues(Q45)).toEqual([]);
  });

  it("açının kendi noktasını reddeden ya da başka noktaya bağlayan cümle düşer", () => {
    expect(
      unitCircleClaimIssues({
        ...Q90,
        optionWhy: [Q90.optionWhy[0]!, "Bu şık yanlıştır; (0, 1) 90° açısına karşılık gelmez.", Q90.optionWhy[2]!, Q90.optionWhy[3]!],
      }),
    ).toHaveLength(1);
    expect(
      unitCircleClaimIssues({ ...Q45, explanation: "Birim çemberde 45° açısının noktası (1/2, √3/2) olur." }),
    ).toHaveLength(1);
    expect(
      unitCircleClaimIssues({ ...Q45, explanation: "Birim çemberde 45° açısının yatay koordinatı 1/2'dir." }),
    ).toHaveLength(1);
  });

  it("birim çember geçmeyen metne ve iki açılı cümleye hüküm vermez", () => {
    expect(
      unitCircleClaimIssues({
        text: "Analitik düzlemde (1, 0) noktası hangi eksendedir?",
        options: ["x ekseni", "y ekseni"],
        explanation: "(1, 0) noktası 90° dönmeden önce x eksenindedir.",
      }),
    ).toEqual([]);
    expect(
      unitCircleClaimIssues({
        ...Q45,
        explanation: "Birim çemberde (1/2, √3/2) noktası 60° açısınındır, 45° açısının değil.",
      }),
    ).toEqual([]);
  });
});

describe("unitCircleOptionReason", () => {
  it("yanlış noktanın hangi açıya ait olduğunu ya da çemberde olmadığını yazar", () => {
    expect(unitCircleOptionReason(Q90, "(√2/2, √2/2)")).toBe(
      "(√2/2, √2/2) noktası 45° açısına karşılık gelir; 90° açısının noktası (0, 1) olur.",
    );
    expect(unitCircleOptionReason(Q90, "(1, 1)")).toBe(
      "(1, 1) birim çemberin üzerinde değildir: 1² + 1² = 2 olur, birim çemberde bu toplam 1'dir.",
    );
    expect(unitCircleOptionReason(Q45, "(1/2, √3/2)")).toBe(
      "(1/2, √3/2) noktası 60° açısına karşılık gelir; 45° açısının noktası (√2/2, √2/2) olur.",
    );
  });

  it("anahtar yanlışsa ya da kök tek açı sormuyorsa yazmaz", () => {
    expect(unitCircleOptionReason({ ...Q90, correct: ["(1, 0)"] }, "(1, 1)")).toBeNull();
    expect(unitCircleOptionReason(QRANGE, "(1, 0) ve (0, 1) arasında")).toBeNull();
    expect(unitCircleOptionReason(Q90, "(0, 1)")).toBeNull();
  });
});
