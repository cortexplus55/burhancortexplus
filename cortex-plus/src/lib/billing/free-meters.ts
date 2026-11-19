import type { ActionCode } from "@/lib/env";
import { addDays, istanbulDay, isoWeekKey } from "@/lib/istanbul-day";
import { FREE_FIRST_LESSON_CLAUSE } from "@/lib/billing/free-tier-copy";

/**
 * Sayıya dayalı ücretsiz katman (24 Ekim 2026, ürün sahibinin kararı). İstemci de okuduğu için
 * `server-only` yok. Sayılar SQL'de de var (`free_meter_limit`: 20261024121000_free_tier_counts, ders sınırı
 * 20261111180000_free_lesson_trial; günlük kredi 0: 20261024123000_free_daily_zero); bekçi test ikisini karşılaştırır.
 *
 * 11 Kasım 2026 akşamı (ürün sahibinin kararı): ücretsiz hesap = deneme için TEK ders. Haftalık 3 ders hakkı kalktı
 * (`FREE_LIMITS.lesson` 0). Açık olanlar:
 * - İlk hazırlığın 1. konusunda adımın ilk açılışı (konu anlatımı, kartlar, doğru/yanlış, konu testi, soru-cevap):
 *   "included" ile ayrılır (`first-lesson-cycle.ts`). Dersin içindeki yardımcılar (koç, eğitmen, adımı farklı anlat,
 *   geri bildirim) de "included".
 * - Günde 3 sohbet mesajı (yazılı soru çözümü ve Stüdyo'daki "Anlatarak öğren" de mesajdır).
 * - Ayda 7 fotoğraftan soru çözümü (Faz 4; önce günde 1).
 * Ders sayacına düşen her iş ("lesson": Çalışma Stüdyosu'ndaki test, kart, doğru/yanlış; "Farklı anlat"; verilmiş
 * adımın yeniden yazımı; ilk olmayan hazırlık; düello kurma) ücretsiz hesapta Plus'a yönlenir. Tek istisna cüzdan
 * bakiyesi (davet hediyesi, eski ek paket): yetiyorsa iş onunla yapılır (`free-lesson-gate.ts`).
 * Podcast, sözlü, yazılı deneme, video ve ses zaten Plus'ta. Gün İstanbul saatiyle.
 */
export type FreeMeter = "lesson" | "chat" | "photo" | "included" | "reexplain";

/**
 * `lesson` 0: sayaç yok, iş Plus'ta (SQL `free_meter_limit('lesson')` ile aynı).
 *
 * Faz 4 (19 Kasım 2026, Burhan'ın kararı): "Farklı anlat" kendi sayacında — günde 40'tan ilk ders döngüsü boyunca
 * TOPLAM 10 hakka iner (`reexplain`, dönemsiz anahtar `trial`); buton yanında "Ücretsiz deneme: X/10". Sohbet günde 3,
 * fotoğraftan çözüm ayda 7 (`photo`, aylık anahtar). Sınır SQL'de de zorunlu (`credit_reserve_metered`).
 */
export const FREE_LIMITS: Record<FreeMeter, number> = { lesson: 0, chat: 3, photo: 7, included: 40, reexplain: 10 };
export const FREE_CHAT_PER_DAY = FREE_LIMITS.chat;
/** Faz 4: fotoğraftan çözüm ayda 7 (önce günde 1). */
export const FREE_PHOTO_PER_MONTH = FREE_LIMITS.photo;
/** Ücretsiz "Farklı anlat": ilk ders döngüsü boyunca toplam. */
export const FREE_REEXPLAIN_TOTAL = FREE_LIMITS.reexplain;
/** Dönemsiz sayacın anahtarı (SQL `free_period_key('reexplain', …)` ile aynı). */
export const TRIAL_PERIOD_KEY = "trial";

/** Ücretsiz hesapta hiç açılmayan işler (SQL `plus_only_action` ile aynı liste). */
export const PLUS_ONLY_ACTIONS: readonly ActionCode[] = [
  "PODCAST_GENERATE",
  "ORAL_EXAM_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "VIDEO_GENERATE",
  "SKETCH_VIDEO_GENERATE",
  "VOICE_TURN",
  "AUDIO_SYNTHESIZE",
];

export function isPlusOnlyAction(code: ActionCode): boolean {
  return PLUS_ONLY_ACTIONS.includes(code);
}

/** Yolda ücretsiz hesapta açılmayan adımlar (yazılı deneme test fiyatıyla yazılır ama Plus'ta). */
export const PLUS_ONLY_NODE_KINDS: ReadonlySet<string> = new Set(["podcast", "oral", "written_exam"]);

/**
 * Çağıran sayaç belirtmezse işin sayacı. Yolda derse dahil işler (test, kart, ders içi yardım) ve
 * kurulum işleri çağıranda "included" der; Stüdyo'daki test/kart varsayılanla ders sayacına düşer — ücretsiz
 * hesapta bu, işin Plus'ta olduğu demektir (`needsPlusOutsideFirstLesson`).
 */
export function defaultFreeMeter(code: ActionCode): FreeMeter | null {
  switch (code) {
    case "STUDY_PLAN_GENERATE":
    case "QUIZ_GENERATE":
    case "DUEL_GENERATE":
    case "FLASHCARD_GENERATE":
      return "lesson";
    case "AI_CHAT_STANDARD":
    case "AI_CHAT_ADVANCED":
      return "chat";
    case "IMAGE_SOLUTION":
      return "photo";
    case "TRUE_FALSE_GENERATE":
      return "lesson";
    case "STEP_REEXPLAIN":
      return "reexplain";
    default:
      return null;
  }
}

/**
 * Ücretsiz hesapta ilk dersin döngüsü DIŞINDA açılmayan iş mi (11 Kasım 2026): Plus'a özel işler ve ders sayacına
 * düşen üretimler (ders, test, kart). Çalışma Stüdyosu rozetleri, kredi kapısı ve fiyat yüzeyleri bu tek kuralı okur.
 * İlk dersin kendi adımları bu kuraldan sunucuda ayrılır (`first-lesson-cycle.ts`).
 */
export function needsPlusOutsideFirstLesson(code: ActionCode): boolean {
  return isPlusOnlyAction(code) || defaultFreeMeter(code) === "lesson";
}

/** Dönemi olan sayaçlar: ders sayacının dönemi yok (sınır 0). */
export type DailyFreeMeter = Exclude<FreeMeter, "lesson">;

/**
 * SQL `free_period_key` ile aynı anahtar (ders sayacının haftalık anahtarı yalnız eski kayıtlar için). Faz 4: fotoğraf
 * aylık (`YYYY-MM`, İstanbul), "Farklı anlat" dönemsiz (`trial`); öteki sayaçlar günlük.
 */
export function freePeriodKey(meter: FreeMeter, now: Date = new Date()): string {
  if (meter === "lesson") return isoWeekKey(now);
  if (meter === "reexplain") return TRIAL_PERIOD_KEY;
  if (meter === "photo") return istanbulDay(now).slice(0, 7);
  return istanbulDay(now);
}

/** Dönemi aylık olan sayaç mı (fotoğraf). */
export function isMonthlyFreeMeter(meter: FreeMeter): boolean {
  return meter === "photo";
}

/**
 * Sayacın yenilendiği an: günlük sayaçta İstanbul gece yarısı, aylık sayaçta (fotoğraf) gelecek ayın ilk günü
 * İstanbul gece yarısı. Dönemsiz sayaç ("Farklı anlat" denemesi) yenilenmez: uzak bir tarih döner, ekran yazmaz.
 */
export function freeMeterResetsAt(meter: DailyFreeMeter, now: Date = new Date()): Date {
  const today = istanbulDay(now);
  if (meter === "reexplain") return new Date(Date.parse("9999-12-31T00:00:00Z"));
  let day = addDays(today, 1);
  if (meter === "photo") {
    const [year, month] = today.split("-").map(Number) as [number, number];
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    day = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  }
  // İstanbul 00:00 = UTC 21:00 bir önceki gün (UTC+3, yaz saati yok).
  return new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 60 * 60 * 1000);
}

export type FreeMeterView = {
  meter: DailyFreeMeter;
  used: number;
  limit: number;
  resetsAtIso: string;
};

/** Öğrenciye görünen sayaçlar; "included" görünmez (kötüye kullanım sınırı), ders sayacı yok. */
export const VISIBLE_FREE_METERS: readonly DailyFreeMeter[] = ["chat", "photo"];

const METER_NAME: Record<DailyFreeMeter, string> = {
  chat: "sohbet mesajı",
  photo: "fotoğraftan çözüm",
  included: "çalışma adımı",
  reexplain: "\"Farklı anlat\"",
};

/**
 * Ders sayacına düşen işin kapı cümlesi (11 Kasım 2026): "doldu" denmez, beklemek çözmez. Kapılar bunu
 * `beyondFreeMessage` ile işin adına bağlar; ham hâli sunucu yanıtının kısa metni.
 */
export const FREE_LESSON_GATE_LINE = "Ücretsiz hesapta ilk dersin açık; devamı Plus'ta.";

/** 402 `free_lesson_limit` yanıtının metni (`errorResponse`) ve üretim hatası ekranının cümlesi. */
export const FREE_LESSON_REFUSAL_MESSAGE = `${FREE_LESSON_GATE_LINE} Plus'a geçince bütün konular, yeni anlatımlar ve Çalışma Stüdyosu üretimleri açılır.`;

/** "Bugünkü 3 ücretsiz sohbet mesajı hakkın bitti." Ders sayacında: ilk ders açık, devamı Plus'ta. */
export function freeLimitReachedLine(meter: FreeMeter): string {
  if (meter === "lesson") return FREE_LESSON_GATE_LINE;
  if (meter === "reexplain") return `${FREE_LIMITS.reexplain} ücretsiz ${METER_NAME.reexplain} denemen bitti; devamı Plus'ta.`;
  if (meter === "photo") return `Bu ayki ${FREE_LIMITS.photo} ücretsiz ${METER_NAME.photo} hakkın bitti.`;
  return `Bugünkü ${FREE_LIMITS[meter]} ücretsiz ${METER_NAME[meter]} hakkın bitti.`;
}

/** "Hakkın gece yarısı yenilenir." / fotoğraf: "Hakkın ay başında yenilenir." */
export function freeMeterResetLine(meter: DailyFreeMeter): string {
  if (meter === "photo") return "Hakkın ay başında yenilenir.";
  if (meter === "reexplain") return "Plus'ta \"Farklı anlat\" sınırsız açılır.";
  return "Hakkın gece yarısı yenilenir.";
}

/** "Ücretsiz deneme: X/10" rozeti (Faz 4): X kalan hak. */
export function freeReexplainBadge(used: number): string {
  const left = Math.max(0, FREE_LIMITS.reexplain - Math.max(0, Math.floor(used || 0)));
  return `Ücretsiz deneme: ${left}/${FREE_LIMITS.reexplain}`;
}

/**
 * Pazarlama ve kapılarda tek cümle; ardına "var", "açık" ya da "ücretsiz" gelir. 31 Ekim 2026 (Paket J1 #3, "ilk doz
 * bedava"): ücretsiz hesapta ilk hazırlığın 1. konusu açık (free-topic-gate.ts). 11 Kasım 2026 akşamı (ürün sahibinin
 * kararı): haftalık ders hakkı yok; ücretsiz hesap ilk dersi, günlük mesajı ve günlük fotoğrafı kapsar.
 */
export const FREE_TIER_SENTENCE =
  `${FREE_FIRST_LESSON_CLAUSE}; ayrıca günde ${FREE_CHAT_PER_DAY} sohbet mesajı ve ayda ${FREE_PHOTO_PER_MONTH} fotoğraftan soru çözümü`;

/** Davet: iki tarafa bir kez hediye (SQL `grant_referral_gift`, 90 kredi = 3 ders). */
export const REFERRAL_GIFT_LESSONS = 3;
/** Davet eden en çok bu kadar davet için hediye alır (SQL `grant_referral_gift`, `referral_counted`). */
export const REFERRAL_MAX_INVITES = 3;
