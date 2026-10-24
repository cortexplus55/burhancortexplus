import type { Icon3DName } from "@/components/ui/icon-3d";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { AUDIO_CHARS_PER_CREDIT_PRICE, CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { DUO_WORDS_PER_MINUTE } from "@/lib/learning/podcast-formats";
import { FREE_CHAT_PER_DAY, FREE_LESSONS_PER_WEEK, FREE_PHOTO_PER_DAY } from "@/lib/billing/free-meters";

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
  /** Ücretsiz hesapta açılmaz (`PLUS_ONLY_ACTIONS`, 24 Ekim 2026). */
  plusOnly: boolean;
  /**
   * Ücretsiz hesapta ayda ne kadar (sayıya dayalı katman): ders haftada 3, mesaj günde 3, fotoğraf günde 1;
   * test ve kartlar yolda derse dahil ("included").
   */
  free: number | "included" | null;
};

const MONTH_DAYS = 30;
const MONTH_WEEKS = 30 / 7;

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
    free: Math.floor(FREE_LESSONS_PER_WEEK * MONTH_WEEKS),
  },
  {
    id: "quiz",
    noun: "konu testi",
    title: "Konu testi",
    blurb: "Her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı.",
    icon: "konu-testi",
    credits: CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits,
    plusOnly: false,
    free: "included",
  },
  {
    id: "cards",
    noun: "kart seti",
    title: "Kartlar",
    blurb: "Zorlandığın kart önce gelir; aralıklı tekrarla unutmazsın.",
    icon: "kartlar",
    credits: CREDIT_PRICE_TABLE.FLASHCARD_GENERATE.credits,
    plusOnly: false,
    free: "included",
  },
  {
    id: "podcast",
    noun: "podcast",
    title: "Podcast",
    blurb: `${PODCAST_MINUTES} dakikalık, iki sesli; yolda, serviste dinle.`,
    icon: "podcast",
    credits: PODCAST_WITH_AUDIO_CREDITS,
    plusOnly: true,
    free: null,
  },
  {
    id: "oral",
    noun: "sözlü deneme",
    title: "Sözlü deneme",
    blurb: "Sesli ya da yazılı cevapla; eksik bıraktığın yeri öğretmen sorar, not verir.",
    icon: "sozlu",
    credits: CREDIT_PRICE_TABLE.ORAL_EXAM_GENERATE.credits,
    plusOnly: true,
    free: null,
  },
  {
    id: "written",
    noun: "yazılı deneme",
    title: "Yazılı deneme",
    blurb: "Çoktan seçmeli ve açık uçlu; istersen kâğıda çöz, fotoğrafını çek.",
    icon: "yazili",
    credits: CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits,
    plusOnly: true,
    free: null,
  },
  {
    id: "photo",
    noun: "fotoğraftan çözüm",
    title: "Fotoğraftan çözüm",
    blurb: "Takıldığın sorunun fotoğrafını çek; adım adım çözüm.",
    icon: "denklem",
    credits: CREDIT_PRICE_TABLE.IMAGE_SOLUTION.credits,
    plusOnly: false,
    free: FREE_PHOTO_PER_DAY * MONTH_DAYS,
  },
  {
    id: "video",
    noun: "video ders",
    title: "Video ders",
    blurb: "Bir dakikalık anlatım; sınavda sorulan bilgi ekranda büyük.",
    icon: "video",
    credits: CREDIT_PRICE_TABLE.VIDEO_GENERATE.credits,
    plusOnly: true,
    free: null,
  },
  {
    id: "chat",
    noun: "soru",
    title: "AI öğretmen",
    blurb: "Takıldığın yeri sor; cevap kendi notuna dayanır.",
    icon: "ogretmen",
    credits: CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits,
    plusOnly: false,
    free: FREE_CHAT_PER_DAY * MONTH_DAYS,
  },
];

export const PLAN_WORK_BY_ID = Object.fromEntries(PLAN_WORK.map((work) => [work.id, work])) as Record<PlanWorkId, PlanWork>;

/** Hakkın tamamı bu işe verilirse kaç tane. */
export function workCount(allowance: number, work: PlanWork): number {
  return Math.floor(allowance / work.credits);
}

/** Ücretsiz hesapta ayda kaç tane; derse dahil işler (test, kart) dersin sayısı kadar. Plus'a özelse 0. */
export function freeMonthlyCount(work: PlanWork): number {
  if (work.plusOnly || work.free === null) return 0;
  if (work.free === "included") return PLAN_WORK_BY_ID.lesson.free as number;
  return work.free;
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

/**
 * Aynı karışım ücretsiz hesapla kaç günde biter: haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf (test ve
 * kartlar derse dahil). Plus'a özel iş varsa ücretsizde hiç olmaz.
 */
export function freeDaysFor(mix: WorkMix): number | null {
  if (PLAN_WORK.some((work) => work.plusOnly && (mix[work.id] ?? 0) > 0)) return null;
  const lessons = Math.ceil(((mix.lesson ?? 0) * 7) / FREE_LESSONS_PER_WEEK);
  const chat = Math.ceil((mix.chat ?? 0) / FREE_CHAT_PER_DAY);
  const photo = Math.ceil((mix.photo ?? 0) / FREE_PHOTO_PER_DAY);
  return Math.max(lessons, chat, photo);
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

/** Hazır tempolar: hepsi Plus hakkına sığar ve gittikçe yoğunlaşır (bekçi test; kredi v3, 24 Ekim 2026). */
export const TEMPO_PRESETS: readonly { id: string; label: string; tempo: Tempo }[] = [
  {
    id: "duzenli",
    label: "Düzenli çalışma",
    tempo: { lessonsPerDay: 1, quizzesPerDay: 2, questionsPerDay: 5, podcastsPerWeek: 3, writtenPerWeek: 1, videosPerMonth: 1 },
  },
  {
    id: "sinav-ayi",
    label: "Sınav ayı",
    tempo: { lessonsPerDay: 2, quizzesPerDay: 3, questionsPerDay: 5, podcastsPerWeek: 5, writtenPerWeek: 2, videosPerMonth: 0 },
  },
  {
    id: "son-sprint",
    label: "Son sprint",
    tempo: { lessonsPerDay: 2, quizzesPerDay: 5, questionsPerDay: 8, podcastsPerWeek: 3, writtenPerWeek: 3, videosPerMonth: 0 },
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
      free: work.free === "included" ? "Derse dahil" : free > 0 ? fmt(free) : "Kapalı",
      plus: fmt(workCount(plus, work)),
    };
  };
  return [row("lesson"), row("quiz"), row("podcast"), row("written"), row("video")];
}
