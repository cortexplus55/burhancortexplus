import type { LessonV3 } from "@/lib/learning/lesson-v3";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";

/**
 * Ana sayfadaki tanıtım turunun örnek verisi (11 Kasım 2026).
 *
 * Ürün sahibi: "Şu an örnek olarak köklü sayıları veriyoruz. Sistemde nasıl bir ekranla karşılaşacaklar, onu
 * göstermemiz lazım. Kodlama kurgusunu iyi yap; görsel olarak da sisteme uysun."
 *
 * Kurgu: tur kendi ekranlarını çizmez. Buradaki veri **ürünün kendi veri biçimindedir** (LessonV3, konu testi
 * sorusu, kart, doğru/yanlış önermesi) ve turda **ürünün kendi bileşenleri** çizer (`ExamLessonSteps`,
 * `ExamQuizPlay`, `FlashCard`, `TrueFalseFocusCard`). Ziyaretçinin gördüğü ekran, kayıt olunca göreceği ekranın
 * aynısıdır; üründe bir ekran değişince tur da kendiliğinden değişir. Fark yalnız verinin kaynağıdır: üründe
 * öğrencinin notundan yazılır ve sunucuda notlanır, burada sabittir ve aynı notlandırma işleviyle tarayıcıda
 * notlanır (hiç ağ isteği yok).
 *
 * İçerik evrensel matematik (kök dışına çıkarma); bekçi test şemaları ve hesapları doğrular.
 */

export const TOUR_PREP = {
  title: "Matematik: Köklü Sayılar",
  topic: "Köklü ifadelerde kök dışına çıkarma",
} as const;

export const TOUR_LESSON: LessonV3 = {
  format: 3,
  title: "Kök dışına çıkarma: tek ve çift derece",
  objective: "Bir sayıyı kökün dışına çıkarırken işaretin ne zaman korunduğunu, ne zaman mutlak değer geldiğini ayırt etmek.",
  overview: "Tek dereceli kök işareti korur; çift dereceli kökten sayı mutlak değerle çıkar. Sınav soruları bu ayrımdan gelir.",
  screens: [
    {
      heading: "Kare ile kök birbirini götürür mü?",
      concept: "Çift dereceli kök",
      lead: "Önce dene, sonra kuralı gör.",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "√((−5)²) işleminin sonucu −5'tir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "(−5)² = 25 ve √25 = 5. Çift dereceli kökün sonucu negatif olamaz; sayı kökten mutlak değerle çıkar.",
            corrected: "√((−5)²) = |−5| = 5",
            whyWrong: "Kare ile kökü birbirini götürür saymak eksiyi dışarı taşır; çift dereceli kök bunu yapmaz.",
            misconception: "Kare ile kök her zaman birbirini götürür",
          },
        },
        {
          type: "text",
          text: "Köklü sayı şu sorunun cevabıdır: hangi sayının karesi (ya da n. kuvveti) kökün içindeki sayıyı verir? **Çift dereceli** kökte bu cevap negatif olamaz. Bu yüzden ==sayı kökten mutlak değerle çıkar==.",
        },
        {
          type: "formula",
          formula: {
            title: "Çift dereceli kök",
            expression: "\\sqrt[2n]{a^{2n}} = |a|",
            symbols: [
              { symbol: "a", meaning: "kökün içindeki taban" },
              { symbol: "2n", meaning: "çift derece (2, 4, 6…)" },
            ],
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Eksiyi dışarı taşıma",
            wrong: "√((−5)²) = −5",
            right: "√((−5)²) = |−5| = 5",
            tell: "Kökün derecesi çiftse sonucu mutlak değer içinde yaz, sonra işarete karar ver.",
          },
        },
      ],
    },
    {
      heading: "Tek derecede işaret korunur",
      concept: "Tek dereceli kök",
      blocks: [
        {
          type: "text",
          text: "**Tek dereceli** kökte negatif sayının kuvveti yine negatiftir; bu yüzden işaret korunur ve mutlak değere gerek kalmaz.",
        },
        {
          type: "formula",
          formula: {
            title: "Tek dereceli kök",
            expression: "\\sqrt[2n+1]{a^{2n+1}} = a",
            symbols: [
              { symbol: "a", meaning: "kökün içindeki taban" },
              { symbol: "2n+1", meaning: "tek derece (3, 5, 7…)" },
            ],
          },
        },
        {
          type: "example",
          example: {
            prompt: "√((−3)²) + ³√(−27) işleminin sonucu kaçtır?",
            steps: ["Çift derece: √((−3)²) = |−3| = 3", "Tek derece: ³√(−27) = −3", "Topla: 3 + (−3) = 0"],
            solution: "0",
          },
        },
        {
          type: "memory_hook_card",
          hook: {
            kind: "shortcut",
            title: "Çift derece, çift muhafız",
            body: "Çift dereceli kökten çıkan sayının iki yanında mutlak değer çizgisi durur: | |. Tek derecede muhafız yok, eksi serbestçe çıkar.",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "x < 0 olmak üzere √(x²) ifadesi aşağıdakilerden hangisine eşittir?",
            options: ["x", "−x", "x²", "0", "1/x"],
            answerIndex: 1,
            explanation: "√(x²) = |x|. x negatif olduğu için |x| = −x olur; −x pozitif bir sayıdır.",
            optionWhy: [
              "x negatiftir; çift dereceli kökün sonucu negatif olamaz.",
              "√(x²) = |x| ve x negatifken |x| = −x'tir.",
              "Kök alındı; kare yerinde kalmaz.",
              "x sıfır değil; x² pozitiftir ve kökü de pozitiftir.",
              "Kök alma, sayının tersini almak değildir.",
            ],
            whyRight: "x negatifken −x pozitiftir ve mutlak değerin kendisidir.",
            hint: "√(x²) = |x|. x negatifken mutlak değer neye eşit olur?",
          },
        },
      ],
    },
  ],
  summary: [
    "Çift dereceli kökten sayı mutlak değerle çıkar: √(a²) = |a|.",
    "Tek dereceli kök işareti korur: ³√(a³) = a.",
    "x negatifken |x| = −x'tir ve bu pozitif bir sayıdır.",
  ],
};

/** Konu testinden bir soru: dersin kuralını iki derecede birden yoklar. Lise düzeyi: beş şık (A–E). */
export const TOUR_QUIZ: PublicQuizQuestion[] = [
  {
    text: "√((−4)²) + ³√(−8) işleminin sonucu kaçtır?",
    options: ["−6", "−2", "2", "6", "12"],
    multi: false,
    correct: ["2"],
    explanation: "√((−4)²) = |−4| = 4 ve ³√(−8) = −2. Toplam: 4 + (−2) = 2.",
    optionWhy: [
      "İlk terimi −4 saymak: çift dereceli kökten negatif sonuç çıkmaz.",
      "Yalnız ikinci terim; ilk terim unutulmuş.",
      "|−4| = 4 ve ³√(−8) = −2; toplam 2.",
      "İkinci terimi +2 saymak: tek dereceli kök işareti korur.",
      "Kökler alınmadan toplanmış: 16 + (−8) değil, önce kök alınır.",
    ],
    steps: ["√((−4)²) = |−4| = 4", "³√(−8) = −2", "4 + (−2) = 2"],
  },
];

/**
 * "İki şık arasında kaldım": üründe sunucu, seçilen iki şıkkın arasındaki kavramsal farkı tek cümleyle hatırlatır ve
 * cevabı söylemez. Turda aynı bileşen bu işlevden beslenir; cümle hangi iki şık seçilirse seçilsin doğru şıkkı
 * söylemez ve hesabı vermez.
 */
export function tourTwoOptionHint(pair: readonly string[]): string {
  const both = (a: string, b: string) => pair.includes(a) && pair.includes(b);
  if (both("−6", "2") || both("−2", "2") || both("−6", "−2")) {
    return "Bu iki şıkkı ayıran, ilk terimin kök dışına hangi işaretle çıktığı. Kökün derecesi çift mi, tek mi? Çift derecede sonuç negatif olabilir mi?";
  }
  if (both("2", "6") || both("6", "−2")) {
    return "Bu iki şıkkı ayıran, ikinci terimin işareti. Tek dereceli kök, içindeki sayının işaretini korur mu?";
  }
  return "Önce her terimin kökünü ayrı ayrı al: çift derecede mutlak değer, tek derecede işaret korunur. Sonra topla.";
}

/** Akıllı kartlar: derste geçen iki kural. */
export const TOUR_CARDS: { front: string; back: string }[] = [
  {
    front: "a negatifken √(a²) kök dışına nasıl çıkar?",
    back: "**|a|** olarak çıkar; a negatif olduğu için bu **−a**'dır. Çift dereceli kökün sonucu negatif olamaz.",
  },
  {
    front: "³√(−27) kaçtır? İşarete ne olur?",
    back: "**−3**. Tek dereceli kök işareti korur: (−3)³ = −27.",
  },
];

/** Doğru / Yanlış: ince nokta ve klasik yanılgı. Ürünün önerme biçimi (`correctedStatement` yanlış önermede). */
export const TOUR_TRUE_FALSE: { text: string; correct: boolean; explanation: string; correctedStatement?: string }[] = [
  {
    text: "x < 0 olmak üzere, √(x²) ifadesi kök dışına −x olarak çıkar.",
    correct: true,
    explanation: "x zaten negatif (örneğin x = −3). Sonucun pozitif çıkması için önüne eksi alır: −x = −(−3) = 3.",
  },
  {
    text: "³√(−8) işleminin sonucu 2'dir, çünkü kökün sonucu negatif olamaz.",
    correct: false,
    explanation: "\"Negatif olamaz\" kuralı yalnız çift dereceli kökler içindir; tek derecede işaret korunur.",
    correctedStatement: "³√(−8) = −2",
  },
];
