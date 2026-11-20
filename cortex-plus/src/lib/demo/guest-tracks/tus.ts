import type { GuestTourContent, TourCard, TourPrep, TourReelSketch, TourTrueFalse } from "@/lib/demo/guest-tour-types";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/**
 * Misafir demosu, "TUS / Tıp · Farmakoloji" branşı (Faz 7, 20 Kasım 2026): kardiyoloji notundan antiaritmik ilaçlar.
 * Örnek notun TUS spotu: amiodaron Sınıf III olmasına rağmen dört sınıfın özelliğini taşır; tiroid ve akciğer
 * toksisitesi sorulur.
 *
 * Vaughan-Williams: Ia Na⁺ (orta) + K⁺ (kinidin, prokainamid, disopiramid), Ib Na⁺ (zayıf; lidokain, meksiletin),
 * Ic Na⁺ (güçlü; flekainid, propafenon), II β₁ (metoprolol, esmolol, propranolol), III K⁺ (amiodaron, sotalol,
 * dofetilid, ibutilid; QT uzar, torsades de pointes), IV L tipi Ca²⁺ (verapamil, diltiazem).
 */

export const TUS_PREP: TourPrep = {
  title: "Farmakoloji: Antiaritmik İlaçlar",
  topic: "Vaughan-Williams sınıflandırması",
};

export const TUS_LESSON: LessonV3 = {
  format: 3,
  title: "Antiaritmikler: Vaughan-Williams sınıfları",
  objective:
    "Antiaritmik ilaçları hedef kanal ya da reseptöre göre sınıflandırmak; QT uzatan Sınıf III ilaçları ve amiodaronun ayrıksı yerini ayırt etmek.",
  overview:
    "Vaughan-Williams sınıflandırması ilacı hedefine göre adlandırır: Sınıf I Na⁺ kanalı, Sınıf II β₁ reseptörü, Sınıf III K⁺ kanalı, Sınıf IV Ca²⁺ kanalı. Sınıf III ilaçlar repolarizasyonu uzatır; QT uzar ve torsades de pointes riski doğar.",
  screens: [
    {
      heading: "Beta blokerler hangi sınıfta?",
      concept: "Vaughan-Williams sınıfları",
      lead: "Önce dene, sonra tabloyu gör.",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Vaughan-Williams sınıflandırmasında beta blokerler Sınıf III'te yer alır.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation:
              "Sınıf numarası hedefi söyler: I Na⁺, II β₁ reseptörü, III K⁺, IV Ca²⁺ kanalı. Beta blokerler Sınıf II'dir; sotalol β blokajına ek olarak K⁺ kanalını da bloke ettiği için Sınıf III sayılır.",
            corrected: "Beta blokerler Sınıf II'dir; Sınıf III ilaçlar K⁺ kanal blokörleridir.",
            whyWrong: "Sotalolün β blokajı yapması bütün beta blokerleri Sınıf III yapmaz; sınıfı K⁺ kanal blokajı belirler.",
            misconception: "Beta blokerler Sınıf III'tür",
          },
        },
        {
          type: "text",
          text: "Vaughan-Williams sınıflandırması ilacı **hedefine** göre adlandırır: ==Sınıf I Na⁺, II β₁ reseptörü, III K⁺, IV Ca²⁺ kanalı==. Sınıf I üçe ayrılır: Ia aksiyon potansiyelini uzatır (kinidin), Ib kısaltır (lidokain), Ic değiştirmez ama QRS'yi belirgin genişletir (flekainid). Sınıf III'te amiodaron ve sotalol, Sınıf IV'te verapamil vardır.",
        },
        {
          type: "note",
          note: {
            title: "TUS spotu",
            body: "Amiodaron Sınıf III olmasına rağmen tüm sınıfların özelliğini taşır; tiroid ve akciğer toksisitesi mutlaka sorulur.",
            tone: "exam",
          },
        },
      ],
    },
    {
      heading: "K⁺ blokajı QT'yi neden uzatır?",
      concept: "Sınıf III ve torsades de pointes",
      blocks: [
        {
          type: "text",
          text: "Sınıf III ilaçlar **K⁺ kanallarını** bloke eder: faz 3 repolarizasyon yavaşlar, EKG'de ==QT uzar== ve **torsades de pointes** riski doğar.",
        },
        {
          type: "example",
          example: {
            prompt: "Sotalol başlanan hastada QTc 520 ms, potasyum 3,1 mmol/L. En büyük risk nedir?",
            steps: [
              "Sotalol K⁺ kanallarını bloke eder, QT uzar.",
              "Hipokalemi repolarizasyonu daha da geciktirir.",
              "Uzamış QT zemininde torsades de pointes gelişebilir.",
            ],
            solution: "Torsades de pointes riski: sotalol gözden geçirilir; potasyum ve magnezyum düzeltilir.",
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Amiodaronu saf K⁺ blokörü sanmak",
            wrong: "Amiodaron yalnız K⁺ kanalını bloke eder.",
            right: "Amiodaron Na⁺, β ve Ca²⁺ üzerine de etki eder.",
          },
        },
        {
          type: "memory_hook_card",
          hook: {
            kind: "shortcut",
            title: "Na · β · K · Ca",
            body: "I sodyum, II beta, III potasyum, IV kalsiyum. Amiodaron dördüne de dokunur.",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Sınıf III bir antiaritmik başlanan hastanın EKG'sinde en çok hangi değişiklik beklenir?",
            options: ["PR kısalması", "QT uzaması", "QRS daralması", "ST yükselmesi", "P dalgası kaybı"],
            answerIndex: 1,
            explanation:
              "Sınıf III ilaçlar K⁺ kanallarını bloke eder; faz 3 repolarizasyon gecikir ve QT uzar. Bu uzama torsades de pointes riskini doğurur.",
            optionWhy: [
              "PR aralığı AV iletimini yansıtır; K⁺ blokajı PR'yi kısaltmaz.",
              "Doğru: K⁺ blokajı repolarizasyonu geciktirir, QT uzar.",
              "QRS Na⁺ akımına bağlıdır; Sınıf III onu daraltmaz.",
              "ST yükselmesi iskemi bulgusudur, Sınıf III etkisi değildir.",
              "P dalgası atriyal depolarizasyondur; K⁺ blokajı onu ortadan kaldırmaz.",
            ],
            whyRight: "K⁺ blokajı faz 3 repolarizasyonu geciktirir; EKG'de QT uzar.",
            hint: "K⁺ kanalı aksiyon potansiyelinin hangi fazında çalışır? O faz EKG'de hangi aralığa düşer?",
          },
        },
      ],
    },
  ],
  summary: [
    "Sınıf I Na⁺, II β₁, III K⁺, IV Ca²⁺: sınıf numarası hedefi söyler.",
    "Sınıf III K⁺ blokajı QT'yi uzatır; torsades de pointes riski doğar.",
    "Amiodaron Sınıf III'tür ama dört sınıfın özelliğini taşır; tiroid ve akciğer toksisitesi sorulur.",
  ],
};

/** Konu testinden bir soru: şıklarda tek K⁺ kanal blokörü var; öbürleri Ib, II, IV ve Vaughan-Williams dışı. */
export const TUS_QUIZ: PublicQuizQuestion[] = [
  {
    text: "Aşağıdaki ilaçlardan hangisi K⁺ kanallarını bloke ederek QT aralığını uzatır ve torsades de pointes riskini artırır?",
    options: ["Lidokain", "Propranolol", "Sotalol", "Verapamil", "Adenozin"],
    multi: false,
    correct: ["Sotalol"],
    explanation:
      "Sotalol, β blokajına ek olarak K⁺ kanallarını bloke eden Sınıf III bir ilaçtır (amiodaron, dofetilid ve ibutilid de bu sınıftadır); repolarizasyon uzar, QT uzar ve torsades de pointes riski artar.",
    optionWhy: [
      "Sınıf Ib: Na⁺ kanalını zayıf bloke eder ve aksiyon potansiyelini kısaltır; QT'yi uzatmaz.",
      "Sınıf II: yalnız β blokajı yapar; K⁺ kanal blokajı ve QT uzaması beklenmez.",
      "Sınıf III: K⁺ kanalını bloke eder, QT uzar; β blokajı da yapar.",
      "Sınıf IV: L tipi Ca²⁺ kanalını bloke eder, AV düğümde iletimi yavaşlatır.",
      "Vaughan-Williams dışında: K⁺ kanallarını açar, AV düğümü kısa süre bloke eder; QT'yi uzatmaz.",
    ],
    steps: ["K⁺ kanal blokajı = Sınıf III", "Şıklardaki tek Sınıf III ilaç sotaloldür", "Sotalol → QT uzar → torsades de pointes riski"],
  },
];

export function tusTwoOptionHint(pair: readonly string[]): string {
  const has = (option: string) => pair.includes(option);
  if (has("Propranolol")) {
    return "Bu iki şıkkı ayıran, ilacın yalnız β reseptörünü mü bloke ettiği, yoksa repolarizasyonu uzatan bir kanalı da mı bloke ettiği. QT'yi hangisi uzatır?";
  }
  if (has("Adenozin")) {
    return "Bu iki şıkkı ayıran, K⁺ kanalına ne yapıldığı: kanalı açmak mı, bloke etmek mi? Repolarizasyonu hangisi uzatır?";
  }
  if (has("Lidokain")) {
    return "Bu iki şıkkı ayıran, hedef kanal. Na⁺ kanalını zayıf bloke eden bir ilaç aksiyon potansiyelini uzatır mı, kısaltır mı?";
  }
  if (has("Verapamil")) {
    return "Bu iki şıkkı ayıran, hedef kanal: Ca²⁺ kanalı AV düğümü yavaşlatır, repolarizasyonu ise başka bir kanal yönetir. Soru hangisini soruyor?";
  }
  return "Önce sorunun hangi kanalı sorduğunu belirle: QT'yi repolarizasyonu geciktiren blokaj uzatır. Her şıkkın hedefini sınıf numarasıyla eşleştir.";
}

export const TUS_CARDS: TourCard[] = [
  {
    front: "QT aralığını uzatıp torsades de pointes riski doğuran antiaritmik sınıfı hangisidir?",
    back: "**Sınıf III** (K⁺ kanal blokörleri): amiodaron, sotalol, dofetilid, ibutilid. Hipokalemi ve bradikardi riski artırır.",
  },
  {
    front: "Amiodaronun TUS'ta mutlaka sorulan iki toksisitesi hangisidir?",
    back: "**Tiroid** (hipo ya da hipertiroidi) ve **akciğer** (pulmoner fibrozis). Sınıf III olsa da dört sınıfın özelliğini taşır.",
  },
];

export const TUS_TRUE_FALSE: TourTrueFalse[] = [
  {
    text: "Amiodaron, Sınıf III'te yer almasına rağmen Na⁺, β ve Ca²⁺ üzerine de etki eder.",
    correct: true,
    explanation:
      "Amiodaron K⁺ kanallarını bloke eden bir Sınıf III ilaçtır ama dört sınıfın özelliğini de taşır; uzun dönem kullanımda tiroid ve akciğer toksisitesi yapar.",
  },
  {
    text: "Lidokain, aksiyon potansiyelini uzatan bir Sınıf Ia antiaritmiktir.",
    correct: false,
    explanation:
      "Lidokain Sınıf Ib'dir: Na⁺ kanalını zayıf bloke eder ve aksiyon potansiyelini kısaltır. Aksiyon potansiyelini uzatan Ia grubu kinidin, prokainamid ve disopiramiddir.",
    correctedStatement: "Lidokain, aksiyon potansiyelini kısaltan bir Sınıf Ib antiaritmiktir",
  },
];

/** Çizimli video önizlemesi: ürünün mekanizma zinciri sahnesi (K⁺ kanalında kırmızı [X] blokaj) ve sınav tuzağı. */
export const TUS_SKETCH: TourReelSketch = {
  kind: "reel",
  title: "Sınıf III antiaritmikler",
  sceneMs: 7000,
  domain: "medicine",
  scenes: [
    {
      beat: "main_diagram",
      sceneTitle: "K⁺ kanalında blokaj",
      narration: "Sınıf III ilaç **K⁺ kanalını** bloke eder. Repolarizasyon gecikir, **QT uzar** ve torsades de pointes riski doğar.",
      keyFact: "K⁺ blokajı → QT uzar",
      voice: "ada",
      visual: {
        kind: "archetype",
        scene: {
          archetype: "MEDICAL_BIOLOGY_PATHWAY",
          title: "Sınıf III antiaritmik: K⁺ kanal blokajından torsades'a",
          pedagogicalLevel: 4,
          layer: "cell",
          steps: [
            { role: "trigger", label: "Sınıf III antiaritmik", detail: "Amiodaron, sotalol, dofetilid, ibutilid" },
            { role: "target", label: "K⁺ kanalı (I_Kr)", detail: "Faz 3 repolarizasyon yavaşlar", effect: "inhibit" },
            { role: "finding", label: "QT uzaması", detail: "Aksiyon potansiyeli ve ERP uzar", effect: "activate" },
            { role: "finding", label: "Torsades de pointes", detail: "Hipokalemi ve bradikardi riski artırır", effect: "activate" },
          ],
          spotlight: {
            text: "Amiodaron Sınıf III olmasına rağmen tüm sınıfların özelliğini taşır; tiroid ve akciğer toksisitesi sorulur.",
          },
        },
      },
    },
    {
      beat: "exam_trap",
      sceneTitle: "Sakın buna düşme",
      narration: "Amiodaronu saf bir K⁺ blokörü sanma. **Dört sınıfın** etkisini taşır; tiroid ve akciğer toksisitesi sorulur.",
      keyFact: "Amiodaron: dört sınıfın özelliği",
      voice: "kerem",
      visual: {
        kind: "exam_trap",
        title: "Amiodaronun ayrıksı yeri",
        wrong: "Amiodaron yalnız K⁺ kanalını bloke eder",
        right: "Amiodaron Sınıf III'tür ama Na⁺, β ve Ca²⁺ üzerine de etki eder",
        tell: "Tiroid ve akciğer toksisitesi geçiyorsa amiodaron",
      },
    },
  ],
};

export const TUS_TOUR: GuestTourContent = {
  prep: TUS_PREP,
  lesson: TUS_LESSON,
  quiz: TUS_QUIZ,
  twoOptionHint: tusTwoOptionHint,
  cards: TUS_CARDS,
  trueFalse: TUS_TRUE_FALSE,
  sketch: TUS_SKETCH,
  warningPattern: /amiodaron/i,
};
