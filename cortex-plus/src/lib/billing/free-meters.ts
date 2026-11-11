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
 * - Günde 1 fotoğraftan soru çözümü.
 * Ders sayacına düşen her iş ("lesson": Çalışma Stüdyosu'ndaki test, kart, doğru/yanlış; "Farklı anlat"; verilmiş
 * adımın yeniden yazımı; ilk olmayan hazırlık; düello kurma) ücretsiz hesapta Plus'a yönlenir. Tek istisna cüzdan
 * bakiyesi (davet hediyesi, eski ek paket): yetiyorsa iş onunla yapılır (`free-lesson-gate.ts`).
 * Podcast, sözlü, yazılı deneme, video ve ses zaten Plus'ta. Gün İstanbul saatiyle.
 */
export type FreeMeter = "lesson" | "chat" | "photo" | "included";

/** `lesson` 0: sayaç yok, iş Plus'ta (SQL `free_meter_limit('lesson')` ile aynı). */
export const FREE_LIMITS: Record<FreeMeter, number> = { lesson: 0, chat: 3, photo: 1, included: 40 };
export const FREE_CHAT_PER_DAY = FREE_LIMITS.chat;
export const FREE_PHOTO_PER_DAY = FREE_LIMITS.photo;

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
    case "FLASHCARD_GENERATE":
      return "lesson";
    case "AI_CHAT_STANDARD":
    case "AI_CHAT_ADVANCED":
      return "chat";
    case "IMAGE_SOLUTION":
      return "photo";
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

/** SQL `free_period_key` ile aynı anahtar (ders sayacının haftalık anahtarı yalnız eski kayıtlar için). */
export function freePeriodKey(meter: FreeMeter, now: Date = new Date()): string {
  return meter === "lesson" ? isoWeekKey(now) : istanbulDay(now);
}

/** Günlük sayacın yenilendiği an: İstanbul gece yarısı. */
export function freeMeterResetsAt(meter: DailyFreeMeter, now: Date = new Date()): Date {
  void meter;
  const day = addDays(istanbulDay(now), 1);
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
  return `Bugünkü ${FREE_LIMITS[meter]} ücretsiz ${METER_NAME[meter]} hakkın bitti.`;
}

/** "Hakkın gece yarısı yenilenir." */
export function freeMeterResetLine(meter: DailyFreeMeter): string {
  void meter;
  return "Hakkın gece yarısı yenilenir.";
}

/**
 * Pazarlama ve kapılarda tek cümle; ardına "var", "açık" ya da "ücretsiz" gelir. 31 Ekim 2026 (Paket J1 #3, "ilk doz
 * bedava"): ücretsiz hesapta ilk hazırlığın 1. konusu açık (free-topic-gate.ts). 11 Kasım 2026 akşamı (ürün sahibinin
 * kararı): haftalık ders hakkı yok; ücretsiz hesap ilk dersi, günlük mesajı ve günlük fotoğrafı kapsar.
 */
export const FREE_TIER_SENTENCE =
  `${FREE_FIRST_LESSON_CLAUSE}; ayrıca günde ${FREE_CHAT_PER_DAY} sohbet mesajı ve günde ${FREE_PHOTO_PER_DAY} fotoğraftan soru çözümü`;

/** Davet: iki tarafa bir kez hediye (SQL `grant_referral_gift`, 90 kredi = 3 ders). */
export const REFERRAL_GIFT_LESSONS = 3;
/** Davet eden en çok bu kadar davet için hediye alır (SQL `grant_referral_gift`, `referral_counted`). */
export const REFERRAL_MAX_INVITES = 3;
