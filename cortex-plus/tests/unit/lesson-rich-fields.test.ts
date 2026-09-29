import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publishLessonDraft } from "@/lib/learning/teaching-standards";
import { exampleIsComplete, repairLearnerLesson, scopeLessonToTopic } from "@/lib/learning/lesson-repair";
import { criticalTeachingFailures, finishTaughtLesson } from "@/lib/learning/lesson-teach";
// (taslak sapmaları için ayrı dosya: lesson-draft-drift.test.ts)
import { groundLearnerLesson } from "@/lib/learning/lesson-grounding";
import { fluencyIssues, repairLessonSurface } from "@/lib/learning/learner-fluency";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/*
  29 Eylül 2026: aynı konuda ("Üslü sayılar", belgesiz) Astra'nın dersinde
  çözümlü örnek, sık hata kartı ve anlamayı yoklayan çoktan seçmeli sorular
  vardı. Bizim dersimizde örnek yoktu ve üç sorunun üçü de dersteki bir
  cümlenin "hep doğru" kopyasıydı.

  Model bunları yazıyordu. Üç ayrı yerde siliniyorlardı:

  1. Taslak süzgeci (normalizeLessonShape) bölümden yalnızca başlık, metin,
     soru, not, kart ve çizimi; sorudan yalnızca beş alanı taşıyordu.
     Formül kartı, adım listesi, tablo, "önce dene", şık gerekçesi, ipucu
     gidiyordu; sayısal ve "kendi cümlelerinle" soruları tümden düşüyordu.
     Kalan tek soru eşiğin altında kalınca boşluk, ders cümlesinin
     yankısı olan doğru/yanlış sorularıyla doluyordu.
  2. Örnek sorusu "?" ile bitmiyorsa ("… işlemini yap.") örnek siliniyordu.
  3. Tamamlanmış hesap "birimli verilen" istiyordu; üslü sayıda birim yok.
*/

const topic = "Üslü Sayılar";

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
  it("görev cümlesiyle biten örnek sorusu kalır", () => {
    const published = publishLessonDraft(draft)!;
    const scoped = scopeLessonToTopic(published, "", topic);
    expect(scoped.example?.prompt).toMatch(/işlemini yap\.$/);
  });

  it("sonucu söyleyen cümle soru sayılmaz", () => {
    const published = publishLessonDraft({
      ...draft,
      example: {
        prompt: "7^5 / 7^3 = 49 bulunur.",
        solution: "Tabanlar aynı olduğu için üsler çıkarılır: 7^(5−3) = 7^2 = 49 bulunur.",
      },
    })!;
    const scoped = scopeLessonToTopic(published, "", topic);
    expect(scoped.example).toBeUndefined();
  });

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

describe("belgesiz ders baştan sona", () => {
  it("örnek, üç soru ve zengin alanlar yayına kadar kalır", async () => {
    const published = publishLessonDraft(draft)!;
    const scoped = scopeLessonToTopic(published, "", topic);
    const grounded = repairLessonSurface(groundLearnerLesson(scoped, "", {}).lesson as LessonV2);
    const repair = await repairLearnerLesson(grounded, { source: "", topicLabel: topic }, async () => null);
    const taught = await finishTaughtLesson(repair.lesson, { source: "", topicLabel: topic });

    expect(criticalTeachingFailures(taught.failures)).toEqual([]);
    expect(taught.salvaged).toBe(false);
    expect(taught.lesson.example?.prompt).toBeTruthy();
    expect(taught.lesson.commonMistake).toBeTruthy();
    expect(taught.lesson.sections.map((section) => section.check?.type)).toEqual([
      "mcq",
      "numerical",
      "explain",
    ]);
    expect(taught.lesson.sections[0].formula).toBeTruthy();
    expect(taught.lesson.sections[0].check?.optionWhy).toHaveLength(4);
    expect(taught.lesson.sections[1].procedure).toBeTruthy();
  });
});

/*
  Canlıda ölçüldü (29 Eylül, lesson_shape): taslak 'trueFalse,-,numerical,
  trueFalse,-' idi; iki doğru/yanlış ders cümlesinin kopyasıydı (echo_check).
  Düğüm rotası öğretim onarımını bağlamıyordu, ders doğrudan kurtarmaya
  düştü ve yayında üç kopya doğru/yanlış kaldı; sayısal soru da gitti.
*/
describe("kopya soru önce onarılır", () => {
  const echoBody =
    "Tabanlar **aynıysa** çarpmada üsler toplanır ve sonuç aynı tabanla yazılır. Tabanlar farklıysa bu kural doğrudan uygulanmaz.";
  const echoLesson = (): LessonV2 => {
    const lesson = publishLessonDraft(draft)!;
    lesson.sections[0] = {
      ...lesson.sections[0],
      heading: "Üslü Sayılarda Çarpma Kuralı",
      body: echoBody,
      check: {
        type: "trueFalse",
        prompt: "Tabanlar aynıysa çarpmada üsler toplanır ve sonuç aynı tabanla yazılır. Doğru mu?",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Tabanlar aynıysa çarpmada üsler toplanır ve sonuç aynı tabanla yazılır.",
      },
    };
    return lesson;
  };
  const patch = {
    sections: [
      {
        heading: "Üslü Sayılarda Çarpma Kuralı",
        body: echoBody,
        check: {
          type: "mcq",
          prompt: "2³ · 2⁴ işleminin sonucu hangisidir?",
          options: ["2⁷", "2¹²", "4⁷", "2¹"],
          answerIndex: 0,
          explanation: "Tabanlar aynı olduğu için üsler toplanır: 3 + 4 = 7; 2¹² üsleri çarpma hatasıdır.",
          optionWhy: [
            "Doğru: üsler toplanır, 3 + 4 = 7.",
            "Üsler çarpılmaz; 3 · 4 = 12 hatalı işlemdir.",
            "Taban değişmez; 2 · 2 = 4 yazmak hatadır.",
            "Üsler çıkarılmaz; 4 − 3 = 1 bölmenin kuralıdır.",
          ],
        },
      },
    ],
  };

  /*
    Kopya soru artık kapıdan önce yalnız başına çıkıyor: bölüm, örnek, sık
    hata ve diğer sorular kalıyor. Kurtarma bunların hepsini götürüyordu.
  */
  it("kopya soru tek başına çıkar, ders kurtarmaya düşmez", async () => {
    const taught = await finishTaughtLesson(echoLesson(), { source: "", topicLabel: topic });
    expect(taught.salvaged).toBe(false);
    expect(criticalTeachingFailures(taught.failures)).toEqual([]);
    expect(taught.lesson.sections[0].heading).toBe("Üslü Sayılarda Çarpma Kuralı");
    expect(taught.lesson.sections[0].check?.type).not.toBe("trueFalse");
    expect(taught.lesson.sections.some((section) => section.check?.type === "numerical")).toBe(true);
    expect(taught.lesson.example).toBeTruthy();
    expect(taught.lesson.commonMistake).toBeTruthy();
  });

  it("bütün sorular kopyaysa onarım çağrılır ve kopya soruyu değiştirir", async () => {
    const onlyEcho = echoLesson();
    onlyEcho.sections = [onlyEcho.sections[0], { ...onlyEcho.sections[2], check: undefined }];
    let asked = false;
    const taught = await finishTaughtLesson(onlyEcho, { source: "", topicLabel: topic }, async () => {
      asked = true;
      return patch;
    });
    expect(asked).toBe(true);
    expect(taught.salvaged).toBe(false);
    expect(taught.lesson.sections[0].check?.type).toBe("mcq");
    expect(taught.lesson.sections[0].check?.optionWhy).toHaveLength(4);
  });

  it("düğüm rotası öğretim onarımını bağlıyor", () => {
    const src = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    const call = src.slice(src.indexOf("taught = await finishTaughtLesson("));
    expect(call.slice(0, call.indexOf(");"))).toMatch(/repairCall\(prompt, \d+\)/);
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
