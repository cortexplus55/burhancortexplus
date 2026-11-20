import type { GuestTourContent, TourCard, TourPrep, TourReelSketch, TourTrueFalse } from "@/lib/demo/guest-tour-types";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/**
 * Misafir demosu, "Üniversite · Mühendislik" branşı (Faz 7, 20 Kasım 2026): akışkanlar mekaniği vize notundan
 * kaldırma kuvveti. Örnek notun hoca uyarısı: hesaba cismin değil sıvının yoğunluğu girer, SI birimi yazılır.
 *
 * Bütün sayılar birbirini tutar (bekçi test hesaplar): alüminyum blok 0,002 m³ · 2700 kg/m³ → G = 54 N,
 * suda F_k = 20 N, dinamometre 34 N; konu testindeki çelik blok 0,005 m³, sıvı 800 kg/m³ → F_k = 40 N.
 */

export const MUHENDISLIK_PREP: TourPrep = {
  title: "Akışkanlar Mekaniği: Kaldırma Kuvveti",
  topic: "Arşimet ilkesi ve kaldırma kuvveti",
};

const FORMULA = "$F_k = V_{\\text{batan}} \\cdot d_{\\text{sıvı}} \\cdot g$";

export const MUHENDISLIK_LESSON: LessonV3 = {
  format: 3,
  title: "Kaldırma kuvveti: hangi yoğunluk, hangi hacim?",
  objective:
    "Kaldırma kuvvetini sıvının yoğunluğu ve batan hacimle hesaplamak; dinamometreye asılı cisimde kuvvet dengesini kurmak.",
  overview:
    "Kaldırma kuvveti, cismin yerini değiştirdiği sıvının ağırlığıdır. Hesaba sıvının yoğunluğu girer; cismin yoğunluğu yalnız yüzüp batmayı belirler. Sonuç newton (N) ile yazılır.",
  screens: [
    {
      heading: "Ağır cisme daha büyük kuvvet mi?",
      concept: "Arşimet ilkesi",
      lead: "Önce dene, sonra kuralı gör.",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Aynı hacimdeki demir ve tahta bilye suya tamamen batırılırsa demir bilyeye daha büyük kaldırma kuvveti etki eder.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation:
              "İki bilye de tamamen battığı için batan hacim aynı, sıvı da aynıdır; kaldırma kuvvetleri eşittir. Cismin yoğunluğu kaldırma kuvvetine girmez.",
            corrected: "Aynı hacimde tamamen batan iki cisme eşit kaldırma kuvveti etki eder.",
            whyWrong: "Ağır cisme büyük kuvvet sanmak cismin yoğunluğunu formüle sokmaktır; kaldırma kuvvetini sıvının yoğunluğu belirler.",
            misconception: "Kaldırma kuvveti cismin yoğunluğuna bağlıdır",
          },
        },
        {
          type: "text",
          text: "**Kaldırma kuvveti**, cismin yerini değiştirdiği sıvının ağırlığıdır (Arşimet ilkesi): ==hesaba cismin değil sıvının yoğunluğu girer==.",
        },
        {
          type: "formula",
          formula: {
            title: "Kaldırma kuvveti",
            expression: FORMULA,
            // Simge çipi düz yazıdır (formülün kendisi KaTeX): alt simge Unicode ya da yalın harf.
            symbols: [
              { symbol: "Fₖ", meaning: "kaldırma kuvveti (N)" },
              { symbol: "V", meaning: "batan hacim (m³)" },
              { symbol: "d", meaning: "sıvının yoğunluğu (kg/m³)" },
            ],
          },
        },
        {
          type: "note",
          note: {
            title: "Hoca uyarısı",
            body: "Kaldırma kuvvetinde cismin değil sıvının yoğunluğu (d_sıvı) alınır; SI birimi (N / Pa) yazılmazsa −5 puan kırılır!",
            tone: "warn",
          },
        },
      ],
    },
    {
      heading: "Dinamometre neden daha az gösterir?",
      concept: "Kuvvet dengesi",
      blocks: [
        {
          type: "text",
          text: "Asılı cisim suya batınca **kaldırma kuvveti** ağırlığın bir kısmını taşır: ==dinamometre görünür ağırlığı gösterir, T = G − F_k==.",
        },
        {
          type: "example",
          example: {
            prompt: "Dinamometreye asılı 0,002 m³ hacimli, 2700 kg/m³ yoğunluklu blok suya (1000 kg/m³) tamamen batıyor (g = 10 m/s²). Dinamometre kaç N gösterir?",
            steps: ["Ağırlık: G = 2700 · 0,002 · 10 = 54 N", "Kaldırma: F_k = 1000 · 0,002 · 10 = 20 N", "Denge: T = G − F_k = 54 − 20 = 34 N"],
            solution: "Dinamometre 34 N gösterir.",
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Dinamometreyi kaldırma kuvveti sanmak",
            wrong: "Dinamometre kaldırma kuvvetini gösterir.",
            right: "Dinamometre görünür ağırlığı gösterir: T = G − F_k.",
          },
        },
        {
          type: "memory_hook_card",
          hook: {
            kind: "shortcut",
            title: "Sıvı taşır, cisim batar",
            body: "Kaldırma kuvvetini sıvının yoğunluğu (d_sıvı) taşır; cisminki yalnız yüzüp batmayı söyler.",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Suya tamamen batırılan asılı cisimde dinamometrenin gösterdiği değer neden azalır?",
            options: ["Kütlesi azalır", "Su, kaldırma kuvveti uygular", "g suda küçülür", "Hacmi küçülür", "Yoğunluğu artar"],
            answerIndex: 1,
            explanation: "Dengede G = F_k + T olur; kaldırma kuvveti ağırlığın bir kısmını taşıdığı için dinamometre T = G − F_k gösterir.",
            optionWhy: [
              "Kütle değişmez; suya batmak cismin maddesini azaltmaz.",
              "Doğru: kaldırma kuvveti ağırlığın bir kısmını taşır.",
              "Yer çekimi ivmesi suda da aynıdır.",
              "Katı cismin hacmi suya batınca küçülmez.",
              "Yoğunluk maddenin özelliğidir; suya batınca artmaz.",
            ],
            whyRight: "Kaldırma kuvveti ağırlığın bir kısmını taşır; dinamometreye kalan T = G − F_k olur.",
            hint: "Cisme yukarı doğru etki eden kuvvetleri say: yalnız dinamometre mi?",
          },
        },
      ],
    },
  ],
  summary: [
    "Kaldırma kuvveti F_k = V_batan · d_sıvı · g; hesaba sıvının yoğunluğu girer.",
    "Cismin yoğunluğu yalnız yüzüp batmayı belirler.",
    "Dinamometre görünür ağırlığı gösterir: T = G − F_k.",
  ],
};

/** Konu testinden bir soru: hocanın uyarısı çeldiricide (cismin yoğunluğu), dinamometre değeri ve kütle de çeldirici. */
export const MUHENDISLIK_QUIZ: PublicQuizQuestion[] = [
  {
    text: "Hacmi 0,005 m³ olan çelik bir blok (d_cisim = 7800 kg/m³), yoğunluğu 800 kg/m³ olan bir sıvıya tamamen batırılıyor. g = 10 m/s² alınırsa bloğa etki eden kaldırma kuvveti kaç N'dur?",
    options: ["4 N", "40 N", "50 N", "350 N", "390 N"],
    multi: false,
    correct: ["40 N"],
    explanation:
      "Kaldırma kuvvetine sıvının yoğunluğu girer: F_k = V_batan · d_sıvı · g = 0,005 · 800 · 10 = 40 N. Çeliğin yoğunluğu bloğun battığını söyler, kuvveti değil.",
    optionWhy: [
      "g çarpanı unutulmuş: 0,005 · 800 = 4 kütledir (kg), kuvvet değil.",
      "F_k = 0,005 · 800 · 10 = 40 N: hesaba sıvının yoğunluğu girer.",
      "Sıvı su sanılmış: 1000 kg/m³ değil, verilen 800 kg/m³ kullanılır.",
      "Bu, dinamometrenin göstereceği görünür ağırlıktır (G − F_k), kaldırma kuvveti değil.",
      "Cismin yoğunluğu kullanılmış: 7800 · 0,005 · 10 = 390 N bloğun ağırlığıdır.",
    ],
    steps: ["F_k = V_batan · d_sıvı · g", "F_k = 0,005 · 800 · 10", "F_k = 40 N"],
  },
];

export function muhendislikTwoOptionHint(pair: readonly string[]): string {
  const has = (option: string) => pair.includes(option);
  if (has("390 N")) {
    return "Bu iki şıkkı ayıran, hesaba hangi yoğunluğun girdiği: bloğun mu, içine battığı sıvının mı? Kaldırma kuvveti kimin ağırlığına eşittir?";
  }
  if (has("350 N")) {
    return "Bu iki şıkkı ayıran, sorunun hangi kuvveti istediği: sıvının bloğa uyguladığı kuvvet mi, dinamometrenin göstereceği değer mi? Kuvvet dengesini düşün.";
  }
  if (has("50 N")) {
    return "Bu iki şıkkı ayıran, sıvının yoğunluğu: soruda verilen değeri mi kullandın, suyun bilinen değerini mi? Soru hangi sıvıyı veriyor?";
  }
  if (has("4 N")) {
    return "Bu iki şıkkı ayıran, sonucun kütle mi kuvvet mi olduğu. Newton'a geçmek için hangi çarpan gerekir?";
  }
  return "Önce kaldırma kuvvetini neyin belirlediğine karar ver: batan hacim, sıvının yoğunluğu ve yer çekimi ivmesi. Sonra birimi yazmayı unutma.";
}

export const MUHENDISLIK_CARDS: TourCard[] = [
  {
    front: "Kaldırma kuvveti hesabında hangi yoğunluk kullanılır?",
    back: `**Sıvının** yoğunluğu (d_sıvı): ${FORMULA}. Cismin yoğunluğu yalnız yüzüp batmayı belirler.`,
  },
  {
    front: "Dinamometreye asılı cisim sıvıya batınca dinamometre ne gösterir?",
    back: "**Görünür ağırlığı**: T = G − F_k. Kaldırma kuvveti ağırlığın bir kısmını taşır.",
  },
];

export const MUHENDISLIK_TRUE_FALSE: TourTrueFalse[] = [
  {
    text: "Suda yüzen bir cisme etki eden kaldırma kuvveti, cismin ağırlığına eşittir.",
    correct: true,
    explanation:
      "Yüzen cisim dengededir: yukarı yönlü kaldırma kuvveti aşağı yönlü ağırlığı tam karşılar (F_k = G). Cisim, ağırlığı kadar sıvının yerini değiştirecek kadar batar.",
  },
  {
    text: "Tamamen batmış bir cisme etki eden kaldırma kuvveti, cisim daha derine indikçe artar.",
    correct: false,
    explanation:
      "Tamamen batmış cisimde batan hacim değişmez; sıvının yoğunluğu ve g de aynı kaldıkça kaldırma kuvveti derinlikle değişmez. Derinlikle artan, cisme etki eden basınçtır.",
    correctedStatement: "Tamamen batmış bir cisme etki eden kaldırma kuvveti derinlikle değişmez",
  },
];

/**
 * Çizimli video önizlemesi: ürünün kuvvet diyagramı sahnesi (`ENGINEERING_PHYSICS_MECHANICS`, akışkan kabı) ve sınav
 * tuzağı sahnesi. Oklar dersin örneğiyle orantılı: G = 54 N (5), T = 34 N (3), F_k = 20 N (2).
 */
export const MUHENDISLIK_SKETCH: TourReelSketch = {
  kind: "reel",
  title: "Kaldırma kuvveti",
  sceneMs: 7000,
  domain: "engineering",
  scenes: [
    {
      beat: "main_diagram",
      sceneTitle: "Suya batan blokta kuvvetler",
      narration: "Bloğu üç kuvvet dengeler: **ağırlık** aşağı, **kaldırma kuvveti** ve ip gerilmesi yukarı. Kaldırma kuvvetine sıvının yoğunluğu girer.",
      keyFact: "G = F_k + T",
      voice: "ada",
      visual: {
        kind: "archetype",
        scene: {
          archetype: "ENGINEERING_PHYSICS_MECHANICS",
          title: "Suya batmış blok: kuvvet dengesi",
          pedagogicalLevel: 3,
          setting: "fluid",
          // Kısa ad: dikey videonun dar çizim alanında cisim kutusu uzun sözcüğü bölüyordu.
          body: { label: "Blok" },
          vectors: [
            { symbol: "F_k", label: "Kaldırma kuvveti (sıvı uygular)", direction: "up", magnitude: 2 },
            { symbol: "T", label: "İp gerilmesi (dinamometre)", direction: "up", magnitude: 3 },
            { symbol: "G", label: "Ağırlık", direction: "down", magnitude: 5 },
          ],
          logic: {
            formula: "F_k = V_batan · d_sıvı · g",
            drivers: [
              { symbol: "V_batan", label: "Batan hacim artarsa", effect: "up" },
              { symbol: "d_sıvı", label: "Sıvının yoğunluğu artarsa", effect: "up" },
              { symbol: "g", label: "Yer çekimi ivmesi artarsa", effect: "up" },
            ],
            distractors: [
              { symbol: "d_cisim", label: "Cismin yoğunluğu: yalnız yüzüp batmayı belirler" },
              { symbol: "h", label: "Derinlik: tamamen batmış cisimde etkisiz" },
            ],
          },
        },
      },
    },
    {
      beat: "exam_trap",
      sceneTitle: "Sakın buna düşme",
      narration: "En sık hata, **cismin yoğunluğunu** formüle koymak. Hesaba sıvının yoğunluğu girer, sonucu da **newton** ile yaz.",
      keyFact: "Yoğunluk sıvınındır",
      voice: "kerem",
      visual: {
        kind: "exam_trap",
        title: "Hangi yoğunluk?",
        wrong: "Kaldırma kuvvetini cismin yoğunluğuyla (d_cisim) hesaplamak",
        right: "F_k = V_batan · d_sıvı · g: hesaba sıvının yoğunluğu girer",
        tell: "Sonucu N ile yaz; birimsiz cevap puan kaybettirir",
      },
    },
  ],
};

export const MUHENDISLIK_TOUR: GuestTourContent = {
  prep: MUHENDISLIK_PREP,
  lesson: MUHENDISLIK_LESSON,
  quiz: MUHENDISLIK_QUIZ,
  twoOptionHint: muhendislikTwoOptionHint,
  cards: MUHENDISLIK_CARDS,
  trueFalse: MUHENDISLIK_TRUE_FALSE,
  sketch: MUHENDISLIK_SKETCH,
  warningPattern: /sıvının\**\s+yoğunluğu|d_sıvı/i,
};
