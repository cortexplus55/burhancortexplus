import { describe, expect, it } from "vitest";
import {
  isScaffoldHeading,
  joinSplitSuperscripts,
  lessonPublishIssues,
  publishLessonDraft,
  type LessonV2,
} from "@/lib/learning/teaching-standards";
import { exampleIsComplete, repairLearnerLesson, scopeLessonToTopic } from "@/lib/learning/lesson-repair";
import { criticalTeachingFailures, finishTaughtLesson } from "@/lib/learning/lesson-teach";
import { groundLearnerLesson } from "@/lib/learning/lesson-grounding";
import { repairLessonSurface, repairTurkishSurface } from "@/lib/learning/learner-fluency";

/*
  29 Eylül 2026. Yayındaki ders modeli (gpt-4.1-mini) ile yerelde yedi
  belgesiz "Üslü Sayılar" taslağı üretildi ve canlıdaki zincirden geçirildi.
  Yedisinin yedisi de kurtarma yoluna (salvageTaughtLesson) düşüyordu:
  öğrenciye 1–3 bölüm ve ders cümlesinin kopyası "hep doğru" sorular
  kalıyordu, çözümlü örnek hiç çıkmıyordu.

  Model şemadan şu yollarla sapıyordu:
  - example ve commonMistake'i bir bölümün İÇİNE yazıyor;
  - çözümü `solution` yerine `steps` + `result` alanlarına yazıyor;
  - "Üslü Sayılar Özet", "… Yaygın Hata", "Bilgi Kontrolü: …" gibi
    şablon bölümleri açıyor;
  - çeldiriciyi açıklamada değil şık başına optionWhy'da çürütüyor.

  Ardından dolgu ders cümlesinden doğru/yanlış kurup (conceptCheck) kritik
  echo_check hatası üretiyor, ders kurtarmaya düşüyordu. Düzeltmeden sonra
  yedisinde de kurtarma yok, kritik hata yok.
*/

const topic = "Üslü Sayılar";

const base = {
  title: "Üslü Sayılar",
  overview:
    "Üslü sayı, aynı çarpanın tekrarını kısa yazmanın yoludur. Bu derste üslü sayıların kurallarını göreceğiz.",
  sections: [
    {
      heading: "Üslü Sayıların Tanımı",
      body: "**Üslü sayı**, tabanın kendisiyle kaç kez çarpıldığını gösterir. Örneğin 2³, 2 × 2 × 2 demektir.",
      note: { title: "**Üslü sayı**", body: "Taban kendisiyle üs kadar çarpılır; 2³ = 8 olur." },
      check: {
        type: "mcq",
        prompt: "Aşağıdakilerden hangisi 3² × 3³ işleminin sonucudur?",
        options: ["3⁵", "3⁶", "3⁹", "3¹"],
        answerIndex: 0,
        explanation: "Tabanlar aynı olduğunda çarpmada üsler toplanır; 2 + 3 = 5.",
        optionWhy: [
          "Doğru: üsler toplanır, 2 + 3 = 5.",
          "3⁶ üsleri çarpmaktan gelir; üsler çarpılmaz.",
          "3⁹ hem tabanı hem üssü karıştırmaktan gelir.",
          "3¹ üsleri çıkarmaktan gelir; o bölmenin kuralıdır.",
        ],
      },
    },
    {
      heading: "Üslü Sayılarda Bölme",
      body: "Tabanlar **aynıysa** bölme işleminde üsler çıkarılır: 5⁴ ÷ 5² = 5². Üslü sayılarda taban sıfırdan farklı olmalıdır.",
      check: {
        type: "trueFalse",
        prompt: "2³ ÷ 2⁵ = 2⁻² eşitliği doğru mudur?",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Bölmede üsler çıkarılır: 3 − 5 = −2 olduğundan eşitlik doğrudur.",
      },
    },
    {
      heading: "Üslü Sayılarla Problem Çözümü",
      body: "Üslü sayılardaki kuralları kullanarak problemlerde hızlı hesap yapılır.",
      example: {
        prompt: "2³ × 2⁴ ÷ 2² işleminin sonucu nedir?",
        steps: ["Çarpmada üsler toplanır: 3 + 4 = 7", "Bölmede üsler çıkarılır: 7 − 2 = 5", "Sonuç: 2⁵"],
        result: "32",
      },
    },
    {
      heading: "Üslü Sayılarla İlgili Yaygın Hata",
      body: "Öğrenciler çarpmada sık sık üsleri çarpar.",
      commonMistake: { claim: "2³ × 2⁴ = 2¹² olur.", correction: "Çarpmada üsler toplanır: 2³ × 2⁴ = 2⁷ olur." },
    },
    {
      heading: "Bilgi Kontrolü: Üslü Sayı İşlemleri",
      body: "Aşağıdaki işlemlerin sonuçlarını hesaplayınız: 1) 4³ × 4⁻¹ 2) 6⁰",
      check: {
        type: "mcq",
        prompt: "4⁵ × 4² işleminin sonucu nedir?",
        options: ["4⁷", "4¹⁰", "4³", "4⁷⁰"],
        answerIndex: 0,
        explanation: "Aynı tabanda çarpma işleminde üsler toplanır; 5 + 2 = 7.",
      },
    },
    {
      heading: "Üslü Sayılar Özet",
      body: "Üslü sayılarda kurallar tabanın aynı olmasına bağlıdır ve dikkat ister.",
    },
  ],
};

describe("gpt-4.1-mini taslak sapmaları", () => {
  const lesson = publishLessonDraft(base)!;

  it("bölüm içine yazılan örnek ve sık hata üste taşınır", () => {
    expect(lesson.commonMistake?.claim).toContain("2¹²");
    expect(lesson.example?.prompt).toContain("2³ × 2⁴ ÷ 2²");
  });

  it("adımlarla yazılan örnek çözüm metnine döner", () => {
    expect(lesson.example?.solution).toContain("3 + 4 = 7");
    expect(lesson.example?.solution).toContain("Sonuç: 2⁵ = 32");
  });

  it("konu adıyla başlayan ya da iki noktalı şablon başlığı düşer", () => {
    const headings = lesson.sections.map((section) => section.heading);
    expect(headings).not.toContain("Üslü Sayılar Özet");
    expect(headings).not.toContain("Üslü Sayılarla İlgili Yaygın Hata");
    expect(headings).not.toContain("Bilgi Kontrolü: Üslü Sayı İşlemleri");
    expect(isScaffoldHeading("Üslü Sayılarda Yaygın Hata: Toplama ve Çarpma Karışıklığı")).toBe(true);
    expect(isScaffoldHeading("Üslü Sayılarda Sık Yapılan Yanlış")).toBe(true);
    expect(isScaffoldHeading("Newton Yasası: Kuvvet ve İvme")).toBe(false);
    expect(isScaffoldHeading("Kalite Kontrolü")).toBe(false);
  });

  it("örneği taşıyan 'Problem Çözümü' bölümü örnek üste alınınca düşer", () => {
    expect(lesson.sections.map((section) => section.heading)).not.toContain("Üslü Sayılarla Problem Çözümü");
  });

  it("şık gerekçesi her yanlış şıkkı çürütüyorsa çoktan seçmeli kalır", () => {
    expect(lesson.sections[0].check?.type).toBe("mcq");
    expect(lesson.sections[0].check?.optionWhy).toHaveLength(4);
  });

  it("not başlığındaki yıldızlar atılır", () => {
    expect(lesson.sections[0].note?.title).toBe("Üslü sayı");
  });

  it("düşen şablon bölümünün sorusu, sorusu olmayan kavram bölümüne geçer", () => {
    const moved = publishLessonDraft({
      ...base,
      sections: [{ ...base.sections[0], check: undefined }, base.sections[1], base.sections[4]],
    })!;
    expect(moved.sections).toHaveLength(2);
    expect(moved.sections[0].check?.prompt).toContain("4⁵ × 4²");
  });

  it("belgesiz zincirde kurtarma yok; örnek, sık hata ve iki soru türü kalır", async () => {
    const scoped = scopeLessonToTopic(lesson, "", topic);
    const grounded = repairLessonSurface(groundLearnerLesson(scoped, "", {}).lesson as LessonV2);
    const repair = await repairLearnerLesson(grounded, { source: "", topicLabel: topic }, async () => null);
    const taught = await finishTaughtLesson(repair.lesson, { source: "", topicLabel: topic });
    expect(taught.salvaged).toBe(false);
    expect(criticalTeachingFailures(taught.failures)).toEqual([]);
    expect(taught.lesson.example).toBeTruthy();
    expect(taught.lesson.commonMistake).toBeTruthy();
    const types = taught.lesson.sections.map((section) => section.check?.type);
    expect(types).toContain("mcq");
    expect(types).toContain("trueFalse");
    // Ders cümlesinden kurulan "hep doğru" dolgu sorusu yok.
    for (const section of taught.lesson.sections) {
      expect(section.check?.whyRight ?? "").not.toBe("Bu yargı kaynağın kurduğu tanımla uyumludur.");
    }
    // Özet kalıp cümle değil, sorulardaki kural cümlesi.
    expect(taught.lesson.summary?.join(" ") ?? "").not.toContain("tanımına ve şartına bağlıdır");
  });
});

/*
  #166 yayına çıkınca canlıda belgesiz ders iki taslakta da "Üs bölünmüş"
  diye reddedildi; öğrenci ders alamadı. Model üssün üssünü "(3²)³ = 3²×³"
  diye yazıyor. Örnek eskiden bölümün içinde kalıp atıldığı için bu satır
  kapıya hiç gelmiyordu; üste taşınınca bütün dersi düşürdü.
*/
describe("bölünmüş üs dersi düşürmez", () => {
  it("iki üst simge arasındaki işleç üst simgeye döner", () => {
    expect(joinSplitSuperscripts("(3²)³ = 3²×³ = 3⁶")).toBe("(3²)³ = 3²ˣ³ = 3⁶");
    expect(joinSplitSuperscripts("2³+⁴ = 2⁷")).toBe("2³⁺⁴ = 2⁷");
    expect(joinSplitSuperscripts("(aᵐ)ⁿ = aᵐ×ⁿ")).toBe("(aᵐ)ⁿ = aᵐˣⁿ");
    // Üst simgeden sonra normal satır gelirse dokunulmaz.
    expect(joinSplitSuperscripts("a² + b² = c²")).toBe("a² + b² = c²");
    expect(joinSplitSuperscripts("3² × 3³ = 3⁵")).toBe("3² × 3³ = 3⁵");
  });

  it("örnekte üssün üssü olan taslak kapıdan geçer", () => {
    const published = publishLessonDraft({
      ...base,
      sections: [
        ...base.sections.slice(0, 2),
        {
          heading: "Üssün Üssü Problem Çözümü",
          body: "Üssün üssü alınırken üsler çarpılır.",
          example: {
            prompt: "(3²)³ ifadesinin değeri kaçtır?",
            solution: "(3²)³ = 3²×³ = 3⁶ = 729 bulunur.",
          },
        },
      ],
    })!;
    expect(published.example?.solution).toContain("3²ˣ³");
    expect(lessonPublishIssues(published).some((issue) => /Üs bölünmüş/.test(issue))).toBe(false);
  });
});

describe("çözümlü örnek yazımı", () => {
  const draft = {
    ...base,
    sections: base.sections.slice(0, 2),
  };

  it("'birimle' kalıbı çözümden atılır", () => {
    const lesson = publishLessonDraft({
      ...draft,
      example: {
        prompt: "3⁴ × 3⁻² işleminin sonucu kaçtır?",
        solution: "Üsler toplanır: 3⁴ × 3⁻² = 3² Sonuç: 3² = 9 birimle",
      },
    })!;
    expect(lesson.example?.solution).not.toMatch(/birimle/);
  });

  it("görev fiili başta ve iki noktalı soru da örnek sorusudur", () => {
    const published = publishLessonDraft({
      ...draft,
      example: {
        prompt: "Çözümleyiniz: (3² × 3⁻³) ÷ 3⁻¹",
        solution: "3² × 3⁻³ = 3⁻¹ olur. 3⁻¹ ÷ 3⁻¹ = 3⁰ = 1 bulunur.",
      },
    })!;
    expect(scopeLessonToTopic(published, "", topic).example?.prompt).toMatch(/^Çözümleyiniz:/);
  });

  it("cümle sonu noktasıyla biten ve üslü yazılan hesap tamamdır", () => {
    expect(exampleIsComplete("2³ × 2⁴ ÷ 2² nedir?\nÇarpmada üsler toplanır: 3 + 4 = 7. Sonuç: 2⁵ = 32.")).toBe(true);
    expect(exampleIsComplete("3⁴ × 3⁻² kaçtır?\n3⁴ × 3⁻² = 3² Sonuç: 9")).toBe(true);
    // Sonuç yazılmamış yarım hesap hâlâ yarım.
    expect(exampleIsComplete("2³ × 2⁴ işlemini yap.\nÜsler toplanır: 3 + 4 ve taban aynı kalır.")).toBe(false);
  });

  it("'kendisiyli' yazım hatası düzeltilir", () => {
    expect(repairTurkishSurface("Taban kendisiyli çarpılır.")).toBe("Taban kendisiyle çarpılır.");
  });
});
