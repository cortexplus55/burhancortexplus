import { exampleIsComplete } from "@/lib/learning/example-completeness";
import { describe, expect, it } from "vitest";
import { publishLessonDraft } from "@/lib/learning/teaching-standards";
// (taslak sapmaları için ayrı dosya: lesson-draft-drift.test.ts)
import { fluencyIssues } from "@/lib/learning/learner-fluency";

const draft = {
  title: "Üslü Sayılar",
  objective: "Üslü ifadelerde çarpma ve bölme kurallarını uygulamak.",
  overview:
    "Üslü sayı, aynı çarpanın tekrarını kısa yazmanın yoludur. Bu derste üslü sayıların anlamını ve kurallarını göreceğiz.",
  sections: [
    {
      heading: "Üslü Sayının Anlamı",
      body: "**Üslü sayı**, tabanın kendisiyle kaç kez çarpıldığını gösterir. Örneğin 2 üzeri 3, 2·2·2 demektir ve 8 eder. Üs, çarpan sayısıdır; tabanla çarpılan bir sayı değildir.",
      formula: { title: "Tanım", expression: "a^n = a·a·…·a (n tane a)", note: "n pozitif tam sayı" },
      checkFirst: true,
      source: { file: "uydurma.pdf", page: 3 },
      check: {
        type: "mcq",
        prompt: "3 üzeri 2 ifadesinin değeri kaçtır?",
        options: ["6", "9", "5", "8"],
        answerIndex: 1,
        explanation: "3·3 = 9 eder; 6 ise 3·2 çarpımıdır, üs tekrar sayısıdır.",
        optionWhy: [
          "6, 3 ile 2'nin çarpımıdır; üs çarpan değildir.",
          "Doğru: 3 kendisiyle iki kez çarpılır, 3·3 = 9.",
          "5, 3 ile 2'nin toplamıdır.",
          "8, 2 üzeri 3'tür; taban ve üs yer değiştirmiş.",
        ],
        hint: "Tabanı kendisiyle kaç kez çarpacaksın?",
        misconception: "Üssü çarpan sanmak",
      },
    },
    {
      heading: "Üslü Sayılarda Çarpma",
      body: "Tabanlar **aynıysa** çarpmada üsler toplanır: 2^2 · 2^3 = 2^5. Tabanlar farklıysa bu kural doğrudan uygulanmaz; önce ortak taban aranır.",
      procedure: {
        title: "Adımlar",
        steps: [
          { label: "Tabana bak", detail: "Tabanlar aynı mı?" },
          { label: "Üsleri topla", detail: "Aynıysa üsleri topla." },
        ],
      },
      table: { columns: ["İfade", "Sonuç"], rows: [["2^2 · 2^3", "2^5"], ["3^1 · 3^4", "3^5"]] },
      check: {
        type: "numerical",
        prompt: "2^3 · 2^2 ifadesinin değeri kaçtır?",
        answer: "32",
        explanation: "Tabanlar aynı olduğu için üsler toplanır: 2^5 = 32 eder.",
      },
    },
    {
      heading: "Üslü Sayılarda Bölme",
      body: "Tabanlar **aynıysa** bölmede üsler çıkarılır: a^m / a^n = a^(m−n). Taban sıfırdan farklı olmalıdır; sıfıra bölme tanımsızdır.",
      check: {
        type: "explain",
        prompt: "Aynı tabanlı üslü sayılar bölünürken neden üsler çıkarılır? Kendi cümlelerinle açıkla.",
        expectedPoints: ["Pay ve paydadaki ortak çarpanlar sadeleşir", "Geriye üslerin farkı kadar çarpan kalır"],
        explanation: "Pay ve paydadaki ortak çarpanlar sadeleşince geriye üslerin farkı kadar çarpan kalır.",
      },
    },
  ],
  example: {
    prompt: "7^5 / 7^3 işlemini yap.",
    solution: "Tabanlar aynı olduğu için üsler çıkarılır: 7^(5−3) = 7^2 = 49 bulunur.",
  },
  commonMistake: { claim: "3^2 = 6 olur.", correction: "3^2 = 3·3 = 9 eder; üs çarpan değil tekrar sayısıdır." },
  summary: ["Üs, tabanın tekrar sayısıdır.", "Aynı tabanda çarpmada üsler toplanır, bölmede çıkarılır."],
};

describe("taslak süzgeci modelin öğreten alanlarını taşır", () => {
  const lesson = publishLessonDraft(draft)!;

  it("formül kartı, adım listesi, tablo ve 'önce dene' kalır", () => {
    expect(lesson.sections[0].formula?.expression).toContain("a^n");
    expect(lesson.sections[0].checkFirst).toBe(true);
    expect(lesson.sections[1].procedure?.steps).toHaveLength(2);
    expect(lesson.sections[1].table?.rows).toHaveLength(2);
  });

  it("şık gerekçesi, ipucu ve yanılgı adı kalır", () => {
    const check = lesson.sections[0].check!;
    expect(check.optionWhy).toHaveLength(4);
    expect(check.hint).toContain("kaç kez");
    expect(check.misconception).toBe("Üssü çarpan sanmak");
  });

  it("sayısal ve 'kendi cümlelerinle' soruları düşmez", () => {
    expect(lesson.sections[1].check).toMatchObject({ type: "numerical", answer: "32" });
    expect(lesson.sections[2].check?.type).toBe("explain");
    expect(lesson.sections[2].check?.expectedPoints).toHaveLength(2);
  });

  /* Künyeyi model değil attachCitations yazar; belgesiz derste uydurma olur. */
  it("modelin yazdığı kaynak künyesi taşınmaz", () => {
    expect(lesson.sections[0].source).toBeUndefined();
  });

  it("boş şık elenince cevap anahtarı doğru şıkta kalır, kayan gerekçe atılır", () => {
    const shifted = publishLessonDraft({
      ...draft,
      sections: [
        {
          ...draft.sections[0],
          check: { ...draft.sections[0].check, options: ["6", "", "9", "8"], answerIndex: 2 },
        },
        ...draft.sections.slice(1),
      ],
    })!;
    expect(shifted.sections[0].check?.options).toEqual(["6", "9", "8"]);
    expect(shifted.sections[0].check?.answerIndex).toBe(1);
    expect(shifted.sections[0].check?.optionWhy).toBeUndefined();
  });
});

describe("çözümlü örnek", () => {

  it("birimsiz matematik hesabı tamamlanmış sayılır", () => {
    expect(exampleIsComplete("5^(-2) ifadesinin değeri nedir?\n5^(-2) = 1/5^2 = 1/25 olur.")).toBe(true);
    expect(exampleIsComplete("7^5 / 7^3 işlemini yap.\n7^(5−3) = 7^2 = 49 bulunur.")).toBe(true);
    expect(exampleIsComplete("sin 30° kaçtır?\nsin 30° = 1/2 olur.")).toBe(true);
  });

  /* Fizik örneğinde verilen birimli niceliktir; o şart gevşemedi. */
  it("birimsiz fizik hesabı hâlâ yarım sayılır", () => {
    expect(exampleIsComplete("Q = m · c · ΔT = 2 · 4,18 · 10 = 83,6")).toBe(false);
    expect(exampleIsComplete("m = 2 kg, c = 4,18 kJ/kg·K, ΔT = 10 K; Q = 2 · 4,18 · 10 = 83,6 kJ")).toBe(true);
  });
});

describe("kişi ekli yüklem akıcılık hatası sayılmaz", () => {
  it("biz ve sen diliyle kurulan cümle yüklemlidir", () => {
    for (const sentence of [
      "Bu derste üslü sayıların anlamını ve kurallarını göreceğiz.",
      "Tabanı kendisiyle kaç kez çarpacağını bu adımda bulursun.",
      "Şimdi bu kuralı küçük bir örnek üzerinde birlikte inceleyelim.",
      "Tabanlar farklıysa üsleri toplamak doğru bir yol değil.",
    ]) {
      expect(fluencyIssues(sentence)).not.toContain("no_predicate");
    }
  });

  it("yüklemsiz kırık cümle hâlâ yakalanır", () => {
    expect(fluencyIssues("Tabanlar aynıysa çarpmada üslerin toplanması ve sonucun aynı tabanla yazılma kuralı")).toContain("no_predicate");
    expect(fluencyIssues("Bir haftadaki gün sayısı ile bir oktavdaki nota sayısı toplamı sekiz")).toContain("no_predicate");
  });
});
