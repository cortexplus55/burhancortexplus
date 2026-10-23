import type { Icon3DName } from "@/components/ui/icon-3d";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { AUDIO_CHARS_PER_CREDIT_PRICE, CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { DUO_WORDS_PER_MINUTE } from "@/lib/learning/podcast-formats";

/**
 * Plus ile bir ayda neler yapılır (20 Ekim 2026, ürün sahibi: "plus alan biri bütün bir plus hesabıyla
 * neler yapabilir … kaç adet kullanabilir, kullanıcıyı çekecek şekilde").
 *
 * Tek kural: her sayı kredi tablosundan hesaplanır, elle yazılmaz (`marketing-claims.test.ts`).
 * Öğrenci kredi sayısı görmez: sayı ("1.200 ders") ve yüzde ("hakkının %58'i") görür. Her iş aynı
 * aylık haktan düşer; "tek başına" sayılar o hakkın tamamı o işe verilirse ulaşılan miktardır.
 */

export type PlanWorkId = "lesson" | "quiz" | "cards" | "podcast" | "oral" | "written" | "photo" | "video" | "chat";

export type PlanWork = {
  id: PlanWorkId;
  /** Sayıyla birlikte okunan ad: "1.200 ders". */
  noun: string;
  title: string;
  blurb: string;
  icon: Icon3DName;
  /** Bedel; ekranda gösterilmez. */
  credits: number;
  /** Ücretsiz günlük haktan büyük: ücretsizde kapalı. */
  plusOnly: boolean;
  /** Ücretsizde günlük hak yerine kendi sayacıyla açık (fotoğraf: günde 3, `FREE_IMAGE_DAILY_LIMIT`). */
  freeDaily?: number;
};

/** Podcast sesiyle dinlenir: senaryo + seslendirme (900 karakter başına). */
export const PODCAST_MINUTES = 5;
/** Türkçe metinde kelime başına ortalama karakter (boşluk dahil). */
const CHARS_PER_WORD = 7.5;
export const PODCAST_WITH_AUDIO_CREDITS =
  CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits +
  Math.ceil((PODCAST_MINUTES * DUO_WORDS_PER_MINUTE * CHARS_PER_WORD) / AUDIO_CHARS_PER_CREDIT_PRICE) *
    CREDIT_PRICE_TABLE.AUDIO_SYNTHESIZE.credits;

export const PLAN_WORK: readonly PlanWork[] = [
  {
    id: "lesson",
    noun: "ders",
    title: "Ders",
    blurb: "Notundan ekran ekran; önce dene soruları, tablolar, sınav vurguları.",
    icon: "ders",
    credits: CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits,
    plusOnly: false,
  },
  {
    id: "quiz",
    noun: "konu testi",
    title: "Konu testi",
    blurb: "Her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı.",
    icon: "konu-testi",
    credits: CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits,
    plusOnly: false,
  },
  {
    id: "cards",
    noun: "kart seti",
    title: "Kartlar",
    blurb: "Zorlandığın kart önce gelir; aralıklı tekrarla unutmazsın.",
    icon: "kartlar",
    credits: CREDIT_PRICE_TABLE.FLASHCARD_GENERATE.credits,
    plusOnly: false,
  },
  {
    id: "podcast",
    noun: "podcast",
    title: "Podcast",
    blurb: `${PODCAST_MINUTES} dakikalık, iki sesli; yolda, serviste dinle.`,
    icon: "podcast",
    credits: PODCAST_WITH_AUDIO_CREDITS,
    plusOnly: true,
  },
  {
    id: "oral",
    noun: "sözlü deneme",
    title: "Sözlü deneme",
    blurb: "Sesli ya da yazılı cevapla; eksik bıraktığın yeri öğretmen sorar, not verir.",
    icon: "sozlu",
    credits: CREDIT_PRICE_TABLE.ORAL_EXAM_GENERATE.credits,
    plusOnly: true,
  },
  {
    id: "written",
    noun: "yazılı deneme",
    title: "Yazılı deneme",
    blurb: "Çoktan seçmeli ve açık uçlu; istersen kâğıda çöz, fotoğrafını çek.",
    icon: "yazili",
    credits: CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits,
    plusOnly: true,
  },
  {
    id: "photo",
    noun: "fotoğraftan çözüm",
    title: "Fotoğraftan çözüm",
    blurb: "Takıldığın sorunun fotoğrafını çek; adım adım çözüm.",
    icon: "denklem",
    credits: CREDIT_PRICE_TABLE.IMAGE_SOLUTION.credits,
    // 23 Ekim 2026 (ürün sahibinin kararı): ücretsiz hesapta günde 3 fotoğraf, krediye dokunmadan (`solve-run.ts`).
    plusOnly: false,
    freeDaily: 3,
  },
  {
    id: "video",
    noun: "video ders",
    title: "Video ders",
    blurb: "Bir dakikalık anlatım; sınavda sorulan bilgi ekranda büyük.",
    icon: "video",
    credits: CREDIT_PRICE_TABLE.VIDEO_GENERATE.credits,
    plusOnly: true,
  },
  {
    id: "chat",
    noun: "soru",
    title: "AI öğretmen",
    blurb: "Takıldığın yeri sor; cevap kendi notuna dayanır.",
    icon: "ogretmen",
    credits: CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits,
    plusOnly: false,
  },
];

export const PLAN_WORK_BY_ID = Object.fromEntries(PLAN_WORK.map((work) => [work.id, work])) as Record<PlanWorkId, PlanWork>;

/** Hakkın tamamı bu işe verilirse kaç tane. */
export function workCount(allowance: number, work: PlanWork): number {
  return Math.floor(allowance / work.credits);
}

/** Ücretsiz plan günlük hakla çalışır: bir günde sığan kadar, otuz gün. */
export function freeMonthlyCount(work: PlanWork): number {
  if (work.plusOnly) return 0;
  if (work.freeDaily !== undefined) return work.freeDaily * 30;
  return Math.floor(PLAN_ALLOWANCES.free / work.credits) * 30;
}

/** Belge: metinli sayfa başına bedel; fotoğraf ve taranmış sayfa ayrıca aylık sınırlı. */
export function documentPagesFor(allowance: number): { pages: number; scanned: number } {
  return {
    pages: Math.floor(allowance / CREDIT_PRICE_TABLE.DOCUMENT_PAGE_PROCESS.credits),
    scanned: PHOTO_PAGE_LIMITS.plus,
  };
}

export type WorkMix = Partial<Record<PlanWorkId, number>>;

export function mixCredits(mix: WorkMix): number {
  return PLAN_WORK.reduce((sum, work) => sum + (mix[work.id] ?? 0) * work.credits, 0);
}

/** Karışımın aylık hakkın ne kadarını kullandığı (0–1+, yüzde olarak gösterilir). */
export function mixShare(mix: WorkMix, allowance: number = PLAN_ALLOWANCES.plusMonthly): number {
  return allowance > 0 ? mixCredits(mix) / allowance : 0;
}

/** Aynı karışım ücretsiz günlük hakla kaç günde biter. Plus'a özel iş varsa ücretsizde hiç olmaz. */
export function freeDaysFor(mix: WorkMix): number | null {
  if (PLAN_WORK.some((work) => work.plusOnly && (mix[work.id] ?? 0) > 0)) return null;
  return Math.ceil(mixCredits(mix) / PLAN_ALLOWANCES.free);
}

/**
 * Ayını kur: öğrenci temposunu günlük/haftalık seçer; ay 30 gün, 30/7 hafta. Sayılar tam sayıya
 * yuvarlanır ki "ayda 128,6 test" yazılmasın.
 */
export type Tempo = {
  lessonsPerDay: number;
  quizzesPerDay: number;
  questionsPerDay: number;
  podcastsPerWeek: number;
  writtenPerWeek: number;
  videosPerMonth: number;
};

export function tempoMix(tempo: Tempo): WorkMix {
  const weeks = 30 / 7;
  return {
    lesson: Math.round(tempo.lessonsPerDay * 30),
    quiz: Math.round(tempo.quizzesPerDay * 30),
    chat: Math.round(tempo.questionsPerDay * 30),
    podcast: Math.round(tempo.podcastsPerWeek * weeks),
    written: Math.round(tempo.writtenPerWeek * weeks),
    video: Math.round(tempo.videosPerMonth),
  };
}

/** Hazır tempolar: hepsi Plus hakkına sığar (bekçi test). */
export const TEMPO_PRESETS: readonly { id: string; label: string; tempo: Tempo }[] = [
  {
    id: "duzenli",
    label: "Düzenli çalışma",
    tempo: { lessonsPerDay: 2, quizzesPerDay: 3, questionsPerDay: 5, podcastsPerWeek: 3, writtenPerWeek: 1, videosPerMonth: 2 },
  },
  {
    id: "sinav-ayi",
    label: "Sınav ayı",
    tempo: { lessonsPerDay: 3, quizzesPerDay: 5, questionsPerDay: 10, podcastsPerWeek: 7, writtenPerWeek: 2, videosPerMonth: 0 },
  },
  {
    id: "son-sprint",
    label: "Son sprint",
    tempo: { lessonsPerDay: 4, quizzesPerDay: 8, questionsPerDay: 12, podcastsPerWeek: 7, writtenPerWeek: 3, videosPerMonth: 1 },
  },
];

/** Aylık fiyatın günlük karşılığı (kuruş, yukarı yuvarlanır). */
export function perDayKurus(monthlyKurus: number): number {
  return Math.ceil(monthlyKurus / 30);
}

/** Plus'ın ücretsize göre kaç kat iş verdiğini yazmayız ("kat" yazılmaz); somut fark satırları. */
export type CompareRow = { label: string; free: string; plus: string };

export function freeVsPlusRows(fmt: (n: number) => string): CompareRow[] {
  const plus = PLAN_ALLOWANCES.plusMonthly;
  const row = (id: PlanWorkId): CompareRow => {
    const work = PLAN_WORK_BY_ID[id];
    const free = freeMonthlyCount(work);
    return {
      label: `${work.title} (ayda)`,
      free: free > 0 ? fmt(free) : "Kapalı",
      plus: fmt(workCount(plus, work)),
    };
  };
  return [row("lesson"), row("quiz"), row("podcast"), row("written"), row("video")];
}
