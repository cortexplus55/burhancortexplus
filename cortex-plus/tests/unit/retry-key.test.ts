import { describe, expect, it } from "vitest";
import {
  acceptReviewVariant,
  reviewItemProblems,
  retryStemBroken,
  reviewQuestionFor,
  type ReviewCheck,
  type StoredReview,
} from "@/lib/learning/teacher-brain";
import { reviewGateQuestion } from "@/lib/learning/lesson-chrome";
import { buildLessonRetryCheck, gradeSectionCheck, resolveCheckForGrade } from "@/lib/learning/lesson-play";
import { lessonMissDrafts, type SectionCheck } from "@/lib/learning/teaching-standards";
import { lessonScreenSchema } from "@/lib/learning/lesson-v3";
import { shuffleLessonChecks } from "@/lib/learning/teacher-lesson";

/*
  20 Ekim 2026 kör kıyas: yanlıştan sonra sorulan ikinci soru ana sorunun ANAHTARIYLA notlanıyordu. Yazar yalnız kök
  yazıyordu ("şıklar aynı kalır"), kod ana sorunun answerIndex'ini ona veriyordu. İncelenen üç tekrarın üçünde de
  öğrencinin gerçekten doğru ikinci cevabı yanlış sayıldı. Saklı derslerdeki (P1, P3) sorular aynen buradadır.
*/

type Check = ReviewCheck & { review?: StoredReview | null; optionWhy?: string[] };

// P1 S2 (KPSS): konfederasyon kaçıran öğrenciye "tek hukuk + milli birlik" (cevabı üniter devlet) soruluyordu.
const P1_Q2: Check = {
  type: "mcq",
  prompt: "Bir devlet modelinde ayrı hukuk sistemi uluslararası sözleşme ile veriliyor. Bu model hangisidir?",
  review: { prompt: "Bir model tek hukuk düzenini milli birlik ilkesiyle birlikte tanımlıyor. Bu model hangisidir?" },
  options: ["Federasyon", "Konfederasyon", "Bölgeli devlet", "Üniter devlet"],
  optionWhy: [
    "Federasyonda ayrı hukuk sistemi anayasal çerçevededir.",
    "Konfederasyonda ayrı hukuk sistemi uluslararası sözleşme ile verilir.",
    "Bölgeli devlet tek hukuk ve milliyetler prensibiyle açıklanır.",
    "Üniter devlet tek hukuk ve milli birlikle açıklanır.",
  ],
  answerIndex: 1,
  explanation:
    "Konfederasyon, ayrı hukuk sisteminin uluslararası sözleşme ile verildiği karma yapılı devlet şeklidir. Bölgeli devlet tek hukuk ve milliyetler prensibiyle; üniter devlet tek hukuk ve milli birlikle açıklanır. Federasyonda ayrı hukuk sistemi anayasal çerçevededir.",
};

// P1 S3: teokrasi kaçıran öğrenciye "egemenlik soya bağlı" (cevabı monarşi) soruluyordu.
const P1_Q3: Check = {
  type: "mcq",
  prompt: "Egemenliğin din adamlarına bağlı olduğu model hangisidir?",
  review: { prompt: "Egemenliğin tek bir soya bağlı olduğu modelin adı nedir?" },
  options: ["Cumhuriyet", "Oligarşi", "Monarşi", "Teokrasi"],
  optionWhy: [
    "Cumhuriyette egemenlik topluma aittir.",
    "Oligarşide egemenlik bir sınıfa veya zümreye bağlıdır.",
    "Monarşide egemenlik bir soya bağlıdır.",
    "Teokraside egemenlik din adamlarına bağlıdır.",
  ],
  answerIndex: 3,
  explanation: "Teokraside egemenlik din adamlarına bağlıdır. Cumhuriyette topluma, monarşide bir soya, oligarşide bir sınıfa veya zümreye bağlıdır.",
};

// P3 S2 (Pediatri): 2 yaş dil basamağını kaçırana "12 aylıkken dil becerisi" (cevabı 1-3 anlamlı kelime) soruluyordu.
const P3_Q2: Check = {
  type: "mcq",
  prompt: "Bir çocuk 2 yaşında merdiven çıkıyor, topa vuruyor ve basit taklit oyunu yapıyor. Dil basamağı hangisidir?",
  review: { prompt: "Bir çocuk 12 aylıkken işaret ediyor ve ince pincer kullanıyor. Tablodaki dil becerisi hangisidir?" },
  options: ["1-3 anlamlı kelime", "Konuşmanın çoğu anlaşılır", "Yaklaşık 10-20 kelime", "2 kelimeli cümleler"],
  optionWhy: [
    "1-3 anlamlı kelime 12 ay basamağıdır.",
    "Konuşmanın çoğunun anlaşılır olması 3 yaş basamağıdır.",
    "Yaklaşık 10-20 kelime 18 ay basamağıdır.",
    "2 kelimeli cümleler 2 yaşın dil basamağıdır.",
  ],
  answerIndex: 3,
  explanation:
    "2 yaş basamağında dil becerisi 2 kelimeli cümlelerdir. Konuşmanın çoğunun anlaşılır olması 3 yaş; yaklaşık 10-20 kelime 18 ay; 1-3 anlamlı kelime 12 ay basamağıdır.",
};

const AUDIT = [
  { name: "P1 S2 (konfederasyon)", check: P1_Q2, trulyRight: "Üniter devlet" },
  { name: "P1 S3 (teokrasi)", check: P1_Q3, trulyRight: "Monarşi" },
  { name: "P3 S2 (2 yaş dil)", check: P3_Q2, trulyRight: "1-3 anlamlı kelime" },
];

const asSection = (check: Check) => check as unknown as SectionCheck;

describe("ikinci soru ana sorunun anahtarını almaz (C0)", () => {
  for (const { name, check, trulyRight } of AUDIT) {
    it(`${name}: yalnız kök tekrar reddedilir; ikinci soru kaçırılan olguyu doğru anahtarla sorar`, () => {
      expect(acceptReviewVariant(check)).toBeNull();
      expect(reviewItemProblems(check).some((problem) => /tam bir soru/.test(problem))).toBe(true);
      const retry = buildLessonRetryCheck(asSection(check), "tr", "");
      // Kayıtlı kök başka bir şıkkı soruyordu; artık sorulmuyor.
      expect(retry.prompt).not.toBe(check.review!.prompt);
      // Ana sorunun doğrusu, ana sorunun olgusu: anahtar ikisini birlikte taşır.
      const correct = check.options[check.answerIndex]!;
      expect(retry.options![retry.answerIndex!]).toBe(correct);
      const graded = resolveCheckForGrade(asSection(check), "retry", "tr", "");
      expect(gradeSectionCheck(graded, { pick: graded.options!.indexOf(correct) }).correct).toBe(true);
      // Eski hata: kayıtlı kökün gerçek cevabını seçen öğrenci yanlış sayılırdı. Kök artık o kök değil.
      expect(graded.prompt).not.toBe(check.review!.prompt);
      expect(trulyRight).not.toBe(correct);
    });
  }

  it("ders içi ikinci soru ve kayıtlı yanılgı kartı aynı soruyu kurar (belirlenimli)", () => {
    for (const { check } of AUDIT) {
      const gate = reviewGateQuestion(asSection(check), "tr", "");
      expect(buildLessonRetryCheck(asSection(check), "tr", "")).toEqual(gate);
      const [draft] = lessonMissDrafts({ lesson: { sections: [{ heading: "Kavram", body: "", check: asSection(check) }] }, missedSectionIndexes: [0] });
      expect(draft?.questionPreview).toBe(gate.prompt);
    }
  });
});

describe("yazarın tam ikinci sorusu (C4c)", () => {
  const full = (review: StoredReview): Check => ({ ...P1_Q2, review });

  it("yeni çeldiricili, aynı doğru şıklı tam öğe kendi açıklamasıyla gelir; ana sorunun gerekçeleri taşınmaz", () => {
    const check = full({
      prompt: "Üye devletler kendi hukuk düzenlerini koruyor ve birliği yalnız aralarındaki bir antlaşma kuruyor. Bu yapı hangisidir?",
      options: ["Konfederasyon", "Federasyon", "Üniter devlet", "Bölgeli devlet"],
      answerIndex: 0,
      explanation: "Ayrı hukuk + uluslararası antlaşma konfederasyondur; federasyonda birliği anayasa kurar.",
    });
    expect(reviewItemProblems(check)).toEqual([]);
    const retry = reviewQuestionFor(check, "tr", "", { sameFactOnly: true });
    expect(retry.prompt).toContain("antlaşma");
    expect(retry.options[retry.answerIndex]).toBe("Konfederasyon");
    expect(retry.explanation).toBe("Ayrı hukuk + uluslararası antlaşma konfederasyondur; federasyonda birliği anayasa kurar.");
    expect(retry.optionWhy).toBeUndefined();
    const graded = resolveCheckForGrade(asSection(check), "retry", "tr", "");
    expect(graded.optionWhy).toBeUndefined();
    expect(gradeSectionCheck(graded, { pick: graded.options!.indexOf("Konfederasyon") }).correct).toBe(true);
  });

  it("doğru şıkkı ana sorununkinden farklı tam öğe reddedilir (konfederasyon kaçırana üniter sorulmaz)", () => {
    const check = full({
      prompt: "Bir model tek hukuk düzenini milli birlik ilkesiyle birlikte tanımlıyor. Bu model hangisidir?",
      options: ["Federasyon", "Konfederasyon", "Bölgeli devlet", "Üniter devlet"],
      answerIndex: 3,
      explanation: "Tek hukuk ve milli birlik üniter devleti tanımlar.",
    });
    expect(reviewItemProblems(check).some((problem) => /ana sorunun doğru şıkkıyla aynı/.test(problem))).toBe(true);
    expect(acceptReviewVariant(check)).toBeNull();
  });

  it("açıklaması şıklara sırayla gönderme yapan tam öğe reddedilir", () => {
    const check = full({
      prompt: "Üye devletler kendi hukuklarını koruyor, birliği bir antlaşma kuruyor. Bu yapı hangisidir?",
      options: ["Konfederasyon", "Federasyon", "Üniter devlet", "Bölgeli devlet"],
      answerIndex: 0,
      explanation: "İlk seçenek doğrudur; diğerleri anayasaya dayanır.",
    });
    expect(reviewItemProblems(check).some((problem) => /sırasıyla gönderme/.test(problem))).toBe(true);
    expect(acceptReviewVariant(check)).toBeNull();
  });

  it("uzun (300 karakterlik) durum kökü şemadan ve kabulden geçer; açıklama ve doğrusu saklanır", () => {
    const longPrompt =
      "Bir ülkede merkezî yönetim tek bir hukuk düzeni uyguluyor; ama anayasa bazı tarihî bölgelere kendi meclislerini kurma, " +
      "eğitim ve kültür alanında yasa yapma yetkisi tanıyor. Bölgeler ayrı devlet değildir ve dış ilişkiler merkezdedir. Bu yapı " +
      "hangi devlet şeklidir?";
    expect(longPrompt.length).toBeGreaterThan(250);
    const screen = lessonScreenSchema.parse({
      heading: "Devlet şekilleri",
      blocks: [
        { type: "text", text: "Devlet şekilleri hukuk düzenine göre ayrılır." },
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Bölgeli devlette her bölgenin ayrı bir hukuk düzeni vardır.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Bölgeli devlette hukuk düzeni tektir.",
            corrected: "Bölgeli devlette hukuk düzeni tektir; bölgelere yetki tanınır.",
            review: {
              prompt: longPrompt,
              options: ["Doğru", "Yanlış"],
              answerIndex: 0,
              explanation: "Tek hukuk düzeni ve bölgelere tanınan yetki bölgeli devleti gösterir.",
              corrected: "Bu yapı bölgeli devlettir.",
            },
          },
        },
      ],
    });
    const block = screen.blocks.find((item) => item.type === "check");
    const review = block?.type === "check" ? block.check.review : undefined;
    expect(review?.prompt).toBe(longPrompt);
    expect(review?.explanation).toBe("Tek hukuk düzeni ve bölgelere tanınan yetki bölgeli devleti gösterir.");
    expect(review?.corrected).toBe("Bu yapı bölgeli devlettir.");
  });

  it("doğru/yanlışın tam ikinci sorusu doğruluk değerini çevirebilir; yanlış ifadede kendi doğrusunu taşır", () => {
    const base: Check & { corrected?: string } = {
      type: "trueFalse",
      prompt: "Boyu yaşıtlarının ortalamasının altında olan her çocuk kısa boyludur.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Ölçüt standart sapmadır.",
      corrected: "Kısa boy −2 SD'nin altıdır.",
    };
    // Doğruluk değeri çevrilmiş (doğru ifade): kabul; ana sorunun "doğrusu" ona gitmez.
    const flipped = { ...base, review: { prompt: "Z-skoru −2,5 olan bir çocuk kısa boylu sayılır.", options: ["Doğru", "Yanlış"], answerIndex: 0, explanation: "−2,5, −2 SD eşiğinin altındadır." } };
    expect(reviewItemProblems(flipped)).toEqual([]);
    const retry = resolveCheckForGrade(asSection(flipped), "retry", "tr", "");
    expect(retry.prompt).toBe("Z-skoru −2,5 olan bir çocuk kısa boylu sayılır.");
    expect(retry.options![retry.answerIndex!]).toBe("Doğru");
    expect(retry.explanation).toBe("−2,5, −2 SD eşiğinin altındadır.");
    expect(retry.corrected).toBeUndefined();
    // Yanlış ifade: kendi doğrusu.
    const own = {
      ...base,
      review: {
        prompt: "Z-skoru −1 olan bir çocuk kısa boyludur.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "−1 ortalamanın altıdır ama eşik −2 SD'dir.",
        corrected: "Z-skoru −1 olan çocuk kısa boylu sayılmaz.",
      },
    };
    const graded = resolveCheckForGrade(asSection(own), "retry", "tr", "");
    expect(gradeSectionCheck(graded, { pick: graded.options!.indexOf("Yanlış") })).toMatchObject({
      correct: true,
      corrected: "Z-skoru −1 olan çocuk kısa boylu sayılmaz.",
    });
    // Doğru/yanlışın ikinci sorusu doğru/yanlış olmalı.
    const wrongShape = { ...base, review: { ...own.review, options: ["Evet", "Hayır"] } };
    expect(reviewItemProblems(wrongShape).some((problem) => /doğru\/yanlıştır/.test(problem))).toBe(true);
  });

  it("şıkları kopyalayan eski tekrar eski kuralla kabul edilir; gerekçeler şık metniyle yeniden eşlenir", () => {
    const check: Check = {
      ...P1_Q3,
      review: { prompt: "Din adamları sınıfının yönettiği bir devlet hangi modele örnektir?", options: ["Teokrasi", "Monarşi", "Oligarşi", "Cumhuriyet"], answerIndex: 0 },
    };
    const retry = reviewQuestionFor(check, "tr", "", { sameFactOnly: true });
    expect(retry.options[retry.answerIndex]).toBe("Teokrasi");
    retry.options.forEach((option, index) => {
      expect(retry.optionWhy![index]).toBe(P1_Q3.optionWhy![P1_Q3.options.indexOf(option)]);
    });
    expect(retry.explanation).toBe(P1_Q3.explanation);
  });
});

describe("tekrarın gerekçeleri kendi şıklarının altında (C4g)", () => {
  it("kaydırılan tekrarda optionWhy[i] options[i]'yi anlatır", () => {
    const options = ["Üniter devlet", "Federasyon", "Konfederasyon", "Bölgeli devlet"];
    const check: SectionCheck = {
      type: "mcq",
      prompt: "Tek hukuk ile milliyetler prensibini birlikte taşıyan devlet şeklini seç.",
      options,
      answerIndex: 3,
      explanation: "Milliyetler prensibi bölgeli devletin ayırt edici özelliğidir.",
      optionWhy: options.map((option) => `${option} gerekçesi.`),
    };
    const retry = resolveCheckForGrade(check, "retry", "tr", "");
    expect(retry.options).not.toEqual(options);
    retry.options!.forEach((option, index) => expect(retry.optionWhy?.[index]).toBe(`${option} gerekçesi.`));
    const graded = gradeSectionCheck(retry, { pick: 0 });
    expect(graded.optionWhy?.[0]).toBe(`${retry.options![0]} gerekçesi.`);
  });

  it("çoktan seçmeliden doğru/yanlışa dönen yedek (odaklı pratik) ana sorunun dört gerekçesini taşımaz", () => {
    const fact = "Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir.";
    const retry = reviewQuestionFor(
      {
        type: "mcq",
        prompt: "Sıcaklığın birimi için hangisi yazılır?",
        options: ["Pascal", "Enerji", fact],
        answerIndex: 2,
        explanation: "Sıcaklık ısıl durumu gösterir.",
        optionWhy: ["Basınç birimi.", "Sıcaklık enerji değildir.", "Doğru tanım."],
      } as Check,
      "tr",
      `Basınç Pascal ile ölçülür. ${fact}`,
    );
    expect(retry.type).toBe("trueFalse");
    expect(retry.optionWhy).toBeUndefined();
  });
});

describe("ders içi ikinci soru aynı olguyu sınar (sameFactOnly)", () => {
  const LIVE = "Sıcaklık enerji birimidir, bu nedenle ısıl durumu gösterir. DOĞRU MU YANLIŞ?";
  const source = "Sıcaklık, bir sistemin ısıl durumunu gösteren bir özelliktir. Basınç Pascal ile ölçülür.";
  const tf: Check = { type: "trueFalse", prompt: LIVE, options: ["Yanlış", "Doğru"], answerIndex: 0, explanation: "Sıcaklık enerji birimi değildir." };

  it("odaklı pratik kaynağın başka cümlesini sorabilir; ders içi ikinci soru sormaz", () => {
    expect(reviewQuestionFor(tf, "tr", source).prompt).toContain("ısıl durumunu gösteren bir özelliktir");
    const lesson = reviewGateQuestion(asSection(tf), "tr", source);
    expect(lesson.prompt).toBe(LIVE);
    expect(lesson.options![lesson.answerIndex!]).toBe("Yanlış");
  });

  it("'… hangisidir?' kökü genel kalıba dönmez; aynı kök şıkları kayarak sorulur", () => {
    const retry = reviewGateQuestion(asSection(P3_Q2), "tr", "");
    expect(retry.prompt).not.toMatch(/için geçerli ifade hangisidir/);
    expect(retry.options![retry.answerIndex!]).toBe("2 kelimeli cümleler");
    expect(retry.options).not.toEqual(P3_Q2.options);
  });
});

describe("kayıtlı yanılgı kartı ikinci sorunun açıklamasını taşır (C4h)", () => {
  it("kartın arkası tam öğenin doğrusu ve açıklaması", () => {
    const check = {
      ...P1_Q3,
      review: {
        prompt: "Yönetimin din adamları sınıfında olduğu bir ülkede egemenlik modeli hangisidir?",
        options: ["Monarşi", "Teokrasi", "Cumhuriyet", "Oligarşi"],
        answerIndex: 1,
        explanation: "Egemenlik din adamlarındaysa teokrasidir; soydaysa monarşi.",
      },
    };
    const [draft] = lessonMissDrafts({ lesson: { sections: [{ heading: "Teokrasi", body: "", check: asSection(check) }] }, missedSectionIndexes: [0] });
    expect(draft?.questionPreview).toBe("Yönetimin din adamları sınıfında olduğu bir ülkede egemenlik modeli hangisidir?");
    expect(draft?.corrected).toBe("Teokrasi. Egemenlik din adamlarındaysa teokrasidir; soydaysa monarşi.");
  });
});

describe("ikinci sorunun şıkları da karışır (C4f)", () => {
  it("doğru şık her zaman ilk değil; anahtar doğru metni gösterir", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 12; i += 1) {
      const check: SectionCheck = {
        type: "mcq",
        prompt: `Soru ${i}: egemenliğin din adamlarında olduğu model?`,
        options: ["Teokrasi", "Monarşi", "Oligarşi", "Cumhuriyet"],
        answerIndex: 0,
        explanation: "Teokraside egemenlik din adamlarındadır.",
        optionWhy: ["a", "b", "c", "d"],
        review: {
          prompt: `Durum ${i}: yönetimin din adamları sınıfında olduğu ülkenin modeli hangisidir?`,
          options: ["Teokrasi", "Monarşi", "Oligarşi", "Cumhuriyet"],
          answerIndex: 0,
          explanation: "Din adamları sınıfı teokrasidir.",
        },
      };
      const shuffled = shuffleLessonChecks({
        format: 3,
        title: "Devlet",
        screens: [{ heading: "Teokrasi", blocks: [{ type: "text", text: "Metin." }, { type: "check", check }] }],
      } as never);
      const block = shuffled.screens[0]!.blocks[1]!;
      const review = block.type === "check" ? block.check.review : undefined;
      expect(review?.options?.[review.answerIndex!]).toBe("Teokrasi");
      positions.add(review!.answerIndex!);
    }
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
});

describe("22 Ekim 2026 inceleme: ikinci sorunun kökü ve ana sorunun gerekçeleri", () => {
  it("'ne olur / ne sağlar / ne eder / kim' soru sayılır; çözümü taşıyan kök yine reddedilir", () => {
    for (const stem of ["Bu durumda sonuç ne olur?", "Bu tedavi hastada ne sağlar?", "Bu işlem hücrede ne eder?", "Bu kuralı kim koyar?"]) {
      expect(retryStemBroken(stem), stem).toBe(false);
    }
    expect(retryStemBroken("Bu işlem hücreyi iki hücre eder?")).toBe(true);
    expect(retryStemBroken("ΔE = -10 - (-4) = hangisi olur?")).toBe(true);
  });

  const primary = {
    type: "mcq",
    prompt: "Bir devlet modelinde ayrı hukuk sistemi uluslararası sözleşme ile veriliyor. Bu model hangisidir?",
    options: ["Federasyon", "Konfederasyon", "Bölgeli devlet", "Üniter devlet"],
    answerIndex: 1,
    explanation: "Konfederasyonda ayrı hukuk uluslararası sözleşmeyle gelir.",
    whyWrong: "ANA whyWrong",
    whyRight: "ANA whyRight",
    hint: "ANA hint",
    misconception: "ANA yanılgı",
    review: {
      prompt: "Üye devletlerin kendi hukuk düzenini uluslararası sözleşmeyle koruduğu birlik hangisidir?",
      options: ["Konfederasyon", "Üniter devlet", "Bölgeli devlet", "Federasyon"],
      answerIndex: 0,
      explanation: "TEKRAR açıklaması",
    },
  };

  it("aynı şık kümesi (başka sıra): ana sorunun whyWrong / hint'i tekrara da aittir", () => {
    const retry = resolveCheckForGrade(primary as unknown as SectionCheck, "retry", "tr", "");
    expect(retry.explanation).toBe("TEKRAR açıklaması");
    expect(retry.whyWrong).toBe("ANA whyWrong");
    expect(retry.hint).toBe("ANA hint");
  });

  it("yazarın tam öğesi yeni şıklarla gelince ana sorunun whyWrong / whyRight / hint / misconception'ı taşınmaz", () => {
    const fresh = resolveCheckForGrade(
      { ...primary, review: { ...primary.review, options: ["Konfederasyon", "Devletler topluluğu", "Özerk bölge", "Eyalet"] } } as unknown as SectionCheck,
      "retry",
      "tr",
      "",
    );
    expect(fresh.options).toEqual(["Konfederasyon", "Devletler topluluğu", "Özerk bölge", "Eyalet"]);
    expect(fresh.explanation).toBe("TEKRAR açıklaması");
    expect(fresh.whyWrong).toBeUndefined();
    expect(fresh.whyRight).toBeUndefined();
    expect(fresh.hint).toBeUndefined();
    expect(fresh.misconception).toBeUndefined();
    expect(fresh.optionWhy).toBeUndefined();
  });
});
