import type { GuestTourContent, TourCard, TourPrep, TourReelSketch, TourTrueFalse } from "@/lib/demo/guest-tour-types";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/**
 * Misafir demosu, "KPSS / Hukuk · Anayasa" branşı (Faz 7, 20 Kasım 2026): yasama süreci notundan TBMM yeter sayıları.
 * Örnek notun sınav tuzağı: geri gönderilen kanun üye tamsayısının salt çoğunluğuyla (301) aynen kabul edilir.
 *
 * Sayılar (TBMM 600 üye): toplantı yeter sayısı 1/3 = 200 (m. 96); karar yeter sayısı katılanların salt çoğunluğu,
 * en az 1/4 + 1 = 151 (m. 96); geri gönderilen kanun salt çoğunluk 301 (m. 89); Anayasa değişikliği teklifi 1/3 = 200,
 * kabulü gizli oyla 3/5 = 360, 360–399 halkoyu, 400 (2/3) ve üstü Cumhurbaşkanı yayımlar ya da halkoyuna sunar
 * (m. 175); iptal davası için üye tamsayısının beşte biri 120 (m. 150).
 */

export const HUKUK_PREP: TourPrep = {
  title: "Anayasa Hukuku: Yasama Süreci",
  topic: "TBMM yeter sayıları ve geri gönderilen kanun",
};

export const HUKUK_LESSON: LessonV3 = {
  format: 3,
  title: "TBMM yeter sayıları: 200, 151 ve 301",
  objective:
    "TBMM'de toplantı ve karar yeter sayısını, üye tamsayısının salt çoğunluğunu ve geri gönderilen kanunun kabul sayısını ayırt etmek.",
  overview:
    "TBMM 600 üyedir. Toplantı yeter sayısı üye tamsayısının üçte biri (200); karar yeter sayısı katılanların salt çoğunluğudur ama 151'den az olamaz. Cumhurbaşkanının geri gönderdiği kanun üye tamsayısının salt çoğunluğuyla (301) aynen kabul edilir.",
  screens: [
    {
      heading: "Her kanuna 301 oy mu gerekir?",
      concept: "Toplantı ve karar yeter sayısı",
      lead: "Önce dene, sonra kuralı gör.",
      blocks: [
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "TBMM'de bir kanunun kabulü için her durumda en az 301 milletvekilinin olumlu oyu gerekir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation:
              "Kanun, toplantıya katılanların salt çoğunluğuyla kabul edilir; bu sayı 151'den az olamaz. 301 üye tamsayısının salt çoğunluğudur ve geri gönderilen kanun gibi özel durumlarda aranır.",
            corrected: "Kanun, katılanların salt çoğunluğuyla kabul edilir; karar yeter sayısı 151'den az olamaz.",
            whyWrong: "Üye tamsayısının salt çoğunluğunu (301) katılanların salt çoğunluğuyla karıştırmak sık yapılan hatadır.",
            misconception: "Her kanun için 301 oy gerekir",
          },
        },
        {
          type: "text",
          text: "TBMM **600** üyeden oluşur. ==Toplantı yeter sayısı üye tamsayısının üçte biridir: 200==. Karar için **katılanların salt çoğunluğu** yeter; ancak karar yeter sayısı ==üye tamsayısının dörtte birinin bir fazlasından (151) az olamaz==. **Üye tamsayısının salt çoğunluğu** ise yarıdan bir fazladır: 301.",
        },
        {
          type: "note",
          note: {
            title: "Sınav tuzağı",
            body: "Geri gönderilen kanunu TBMM üye tamsayısının salt çoğunluğu (301) ile aynen kabul edebilir.",
            tone: "exam",
          },
        },
      ],
    },
    {
      heading: "Geri gönderilen kanun kaç oyla döner?",
      concept: "Geri gönderilen kanun",
      blocks: [
        {
          type: "text",
          text: "Cumhurbaşkanı kanunu ==15 gün içinde== geri gönderebilir; TBMM onu ==üye tamsayısının salt çoğunluğuyla (301) aynen kabul ederse== Cumhurbaşkanı yayımlar.",
        },
        {
          type: "example",
          example: {
            prompt: "420 milletvekilinin katıldığı oturumda geri gönderilen kanun 290 oyla aynen kabul ediliyor. Yeter mi?",
            steps: [
              "420 katılımcı 200'ü aşıyor: oturum geçerli.",
              "Geri gönderilen kanunda üye tamsayısının salt çoğunluğu aranır: 301.",
              "290 oy 301'e ulaşmıyor.",
            ],
            solution: "Yetmez: 290 oy katılanların salt çoğunluğunu (211) geçse de 301'e ulaşmaz; kanun aynen kabul edilmiş sayılmaz.",
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Kanunda nitelikli çoğunluk aramak",
            wrong: "Geri gönderilen kanun için 400 oy gerekir.",
            right: "Geri gönderilen kanun 301 oyla aynen kabul edilir.",
          },
        },
        {
          type: "memory_hook_card",
          hook: {
            kind: "shortcut",
            title: "200 toplar, 151 karar verir, 301 geri döndürür",
            body: "Üçte bir, dörtte bir artı bir, yarıdan bir fazla: üç sayı, üç iş.",
          },
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "TBMM'de karar yeter sayısının alt sınırı kaçtır?",
            options: ["120", "151", "200", "301", "360"],
            answerIndex: 1,
            explanation:
              "Karar yeter sayısı katılanların salt çoğunluğudur; ancak üye tamsayısının dörtte birinin bir fazlasından az olamaz: 600 / 4 + 1 = 151.",
            optionWhy: [
              "Bu beşte birdir: Anayasa Mahkemesinde iptal davası açabilecek milletvekili sayısı.",
              "Doğru: 600'ün dörtte biri 150, bir fazlası 151.",
              "Bu toplantı yeter sayısıdır (üçte bir).",
              "Bu üye tamsayısının salt çoğunluğudur.",
              "Bu üye tamsayısının beşte üçüdür; Anayasa değişikliğinin kabulünde aranır.",
            ],
            whyRight: "Katılanların salt çoğunluğu yeter ama bu sayı 151'in altına inemez.",
            hint: "Alt sınır üye tamsayısının hangi kesrine bağlı? Bir fazlasını unutma.",
          },
        },
      ],
    },
  ],
  summary: [
    "Toplantı yeter sayısı üye tamsayısının üçte biri: 200.",
    "Karar yeter sayısı katılanların salt çoğunluğu; alt sınır 151.",
    "Geri gönderilen kanun üye tamsayısının salt çoğunluğuyla (301) aynen kabul edilir.",
  ],
};

/** Konu testinden bir soru: beş şıkkın her biri Anayasadaki gerçek bir yeter sayı. */
export const HUKUK_QUIZ: PublicQuizQuestion[] = [
  {
    text: "Cumhurbaşkanınca bir daha görüşülmek üzere TBMM'ye geri gönderilen bir kanunun aynen kabul edilebilmesi için en az kaç milletvekilinin kabul oyu gerekir?",
    options: ["151", "200", "301", "360", "400"],
    multi: false,
    correct: ["301"],
    explanation:
      "Geri gönderilen kanun üye tamsayısının salt çoğunluğuyla aynen kabul edilir: 600 / 2 + 1 = 301. Bu durumda Cumhurbaşkanı kanunu yayımlar.",
    optionWhy: [
      "Bu, karar yeter sayısının alt sınırıdır; geri gönderilen kanunda katılan sayısına bakılmaz.",
      "Bu toplantı yeter sayısıdır: oturumun açılması için gerekir, kabul için değil.",
      "Üye tamsayısının salt çoğunluğu: 600 / 2 + 1 = 301.",
      "Bu üye tamsayısının beşte üçüdür; Anayasa değişikliğinin kabulünde aranır.",
      "Bu üye tamsayısının üçte ikisidir; bu çoğunlukla kabul edilen Anayasa değişikliğini Cumhurbaşkanı yayımlar ya da halkoyuna sunar.",
    ],
    steps: ["Geri gönderilen kanun → üye tamsayısının salt çoğunluğu", "600 / 2 + 1 = 301", "301 oyla aynen kabul → Cumhurbaşkanı yayımlar"],
  },
];

export function hukukTwoOptionHint(pair: readonly string[]): string {
  const has = (option: string) => pair.includes(option);
  if (has("200")) {
    return "Bu iki şıkkı ayıran, sayının oturumu açmaya mı yoksa kabul kararına mı yettiği. Toplantı yeter sayısı bir kabul sayısı mıdır?";
  }
  if (has("360") || has("400")) {
    return "Bu iki şıkkı ayıran, oylanan metnin türü: sıradan bir kanun mu, Anayasa değişikliği mi? Nitelikli çoğunluk hangisinde aranır?";
  }
  if (has("151")) {
    return "Bu iki şıkkı ayıran, çoğunluğun neye göre hesaplandığı: toplantıya katılanlara göre mi, üye tamsayısına göre mi? Geri gönderilen kanunda hangisi aranır?";
  }
  return "Önce sorunun hangi işlemi sorduğunu belirle: oturumun açılması, sıradan kabul, geri gönderilen kanunun yeniden kabulü ya da Anayasa değişikliği. Her birinin ölçütü farklı.";
}

export const HUKUK_CARDS: TourCard[] = [
  {
    front: "TBMM'de toplantı yeter sayısı ve karar yeter sayısının alt sınırı kaçtır?",
    back: "Toplantı: üye tamsayısının üçte biri, **200**. Karar: katılanların salt çoğunluğu, ama en az **151**.",
  },
  {
    front: "Cumhurbaşkanının geri gönderdiği kanun hangi çoğunlukla aynen kabul edilir?",
    back: "Üye tamsayısının salt çoğunluğuyla: **301**. Aynen kabul edilirse Cumhurbaşkanı yayımlar.",
  },
];

export const HUKUK_TRUE_FALSE: TourTrueFalse[] = [
  {
    text: "Anayasa değişikliği teklifi TBMM üye tamsayısının en az üçte biri tarafından yazıyla yapılır.",
    correct: true,
    explanation:
      "Teklif için en az 200 milletvekilinin (üçte bir) yazılı teklifi gerekir; kabul ise gizli oyla en az beşte üç (360) çoğunlukla olur.",
  },
  {
    text: "Cumhurbaşkanınca geri gönderilen kanunun aynen kabulü için üye tamsayısının üçte iki çoğunluğu gerekir.",
    correct: false,
    explanation:
      "Üçte iki (400) Anayasa değişikliğinde aranır. Geri gönderilen kanun üye tamsayısının salt çoğunluğuyla (301) aynen kabul edilir ve Cumhurbaşkanınca yayımlanır.",
    correctedStatement: "Geri gönderilen kanun, üye tamsayısının salt çoğunluğuyla (301) aynen kabul edilir",
  },
];

/**
 * Çizimli video önizlemesi: ürünün karar akışı sahnesi. Anayasa değişikliği üç kademeli karar ağacı ve çoğunluk
 * barometresi; örnek oylamada 380 kabul oyu 3/5'i (360) geçer, 2/3'ü (400) geçmez: değişiklik halkoyuna gider.
 */
export const HUKUK_SKETCH: TourReelSketch = {
  kind: "reel",
  title: "Anayasa değişikliğinde çoğunluklar",
  sceneMs: 7000,
  domain: "constitution",
  scenes: [
    {
      beat: "main_diagram",
      sceneTitle: "Teklif, oylama, sonuç",
      narration: "Teklif için **200** imza, kabul için gizli oyla **360** oy gerekir. **400** ve üstünde Cumhurbaşkanı yayımlar ya da halkoyuna sunar.",
      keyFact: "3/5 = 360 · 2/3 = 400",
      voice: "ada",
      visual: {
        kind: "archetype",
        scene: {
          archetype: "LAW_SOCIAL_FLOWCHART",
          title: "Anayasa değişikliği: teklif, oylama, sonuç",
          pedagogicalLevel: 4,
          // Dikey videoda ağaç üç kademe iç içe daralır: düğüm ve sonuç metinleri kısa (kesilmeden sığsın).
          nodes: [
            { id: "teklif", text: "En az 200 (1/3) imzalı teklif mi?", yes: "oylama", no: "Teklif yapılamaz" },
            { id: "oylama", text: "Gizli oyla 360 (3/5) kabul mü?", yes: "sonuc", no: "Reddedilir" },
            { id: "sonuc", text: "Kabul 400 (2/3) ya da üstü mü?", yes: "Yayım ya da halkoyu", no: "Halkoyuna gider" },
          ],
          // Etiket bütçesi dar ekranda satır düşürür: önce 3/5 ve 2/3 (örnek oylama 380: biri geçilir, biri geçilmez).
          majority: [
            { label: "Kabul (gizli oy)", fraction: "3/5", count: 360, total: 600, actual: 380 },
            { label: "Doğrudan yayım", fraction: "2/3", count: 400, total: 600, actual: 380 },
            { label: "Teklif", fraction: "1/3", count: 200, total: 600 },
          ],
        },
      },
    },
    {
      beat: "exam_trap",
      sceneTitle: "Sakın buna düşme",
      narration: "Geri gönderilen **kanunda** nitelikli çoğunluk aranmaz. TBMM onu üye tamsayısının salt çoğunluğuyla, **301** oyla aynen kabul eder.",
      keyFact: "Geri gönderilen kanun: 301",
      voice: "kerem",
      visual: {
        kind: "exam_trap",
        title: "Kanun mu, Anayasa değişikliği mi?",
        wrong: "Geri gönderilen kanun için üçte iki (400) gerekir",
        right: "Geri gönderilen kanun 301 oyla (salt çoğunluk) aynen kabul edilir",
        tell: "360 ve 400 yalnız Anayasa değişikliğinde aranır",
      },
    },
  ],
};

export const HUKUK_TOUR: GuestTourContent = {
  prep: HUKUK_PREP,
  lesson: HUKUK_LESSON,
  quiz: HUKUK_QUIZ,
  twoOptionHint: hukukTwoOptionHint,
  cards: HUKUK_CARDS,
  trueFalse: HUKUK_TRUE_FALSE,
  sketch: HUKUK_SKETCH,
  warningPattern: /301|salt çoğunluğu/,
};
