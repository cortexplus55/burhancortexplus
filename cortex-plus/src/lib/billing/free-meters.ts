import type { ActionCode } from "@/lib/env";
import { addDays, istanbulDay, isoWeekday, isoWeekKey } from "@/lib/istanbul-day";

/**
 * Sayıya dayalı ücretsiz katman (24 Ekim 2026, ürün sahibinin kararı). İstemci de okuduğu için
 * `server-only` yok. Sayılar SQL'de de var (20261024121000_free_tier_counts, `free_meter_limit`; günlük
 * kredi 0: 20261024123000_free_daily_zero);
 * bekçi test ikisini karşılaştırır.
 *
 * - Haftada 3 ders. Dersin içindeki yardımcılar (koç, eğitmen notu) ve yolda o dersin ardındaki test /
 *   kartlar derse dahil ("included"). Araçlar'dan açılan test, kart, doğru/yanlış dersten düşer;
 *   Araçlar'daki "Anlatarak öğren" mesaj sayacından.
 * - Günde 3 sohbet mesajı (yazılı soru çözümü de mesajdır).
 * - Günde 1 fotoğraftan soru çözümü.
 * - Podcast, sözlü, yazılı deneme, video ve ses Plus'ta.
 * Gün ve hafta İstanbul saatiyle; hafta Pazartesi 00:00'da başlar.
 */
export type FreeMeter = "lesson" | "chat" | "photo" | "included";

export const FREE_LIMITS: Record<FreeMeter, number> = { lesson: 3, chat: 3, photo: 1, included: 40 };
export const FREE_LESSONS_PER_WEEK = FREE_LIMITS.lesson;
export const FREE_CHAT_PER_DAY = FREE_LIMITS.chat;
export const FREE_PHOTO_PER_DAY = FREE_LIMITS.photo;

/** Ücretsiz hesapta hiç açılmayan işler (SQL `plus_only_action` ile aynı liste). */
export const PLUS_ONLY_ACTIONS: readonly ActionCode[] = [
  "PODCAST_GENERATE",
  "ORAL_EXAM_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "VIDEO_GENERATE",
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
 * kurulum işleri çağıranda "included" der; Araçlar'daki test/kart varsayılanla dersten düşer.
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

/** SQL `free_period_key` ile aynı anahtar. */
export function freePeriodKey(meter: FreeMeter, now: Date = new Date()): string {
  return meter === "lesson" ? isoWeekKey(now) : istanbulDay(now);
}

/** Sayacın yenilendiği an: gün sayaçları İstanbul gece yarısı, ders sayacı Pazartesi 00:00. */
export function freeMeterResetsAt(meter: FreeMeter, now: Date = new Date()): Date {
  const today = istanbulDay(now);
  const day = meter === "lesson" ? addDays(today, 8 - isoWeekday(today)) : addDays(today, 1);
  // İstanbul 00:00 = UTC 21:00 bir önceki gün (UTC+3, yaz saati yok).
  return new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 60 * 60 * 1000);
}

export type FreeMeterView = {
  meter: FreeMeter;
  used: number;
  limit: number;
  resetsAtIso: string;
};

/** Öğrenciye görünen sayaçlar; "included" görünmez (kötüye kullanım sınırı). */
export const VISIBLE_FREE_METERS: readonly FreeMeter[] = ["lesson", "chat", "photo"];

const METER_NAME: Record<FreeMeter, { noun: string; period: string }> = {
  lesson: { noun: "ders", period: "Bu haftaki" },
  chat: { noun: "sohbet mesajı", period: "Bugünkü" },
  photo: { noun: "fotoğraftan çözüm", period: "Bugünkü" },
  included: { noun: "çalışma adımı", period: "Bugünkü" },
};

/** "Bu haftaki 3 ücretsiz dersin bitti." */
export function freeLimitReachedLine(meter: FreeMeter): string {
  const name = METER_NAME[meter];
  return `${name.period} ${FREE_LIMITS[meter]} ücretsiz ${name.noun} hakkın bitti.`;
}

/** "Pazartesi 00:00'da yenilenir" / "Gece yarısı yenilenir". */
export function freeMeterResetLine(meter: FreeMeter): string {
  return meter === "lesson" ? "Ders hakkın Pazartesi 00:00'da yenilenir." : "Hakkın gece yarısı yenilenir.";
}

/** Pazarlama ve kapılarda tek cümle. */
export const FREE_TIER_SENTENCE =
  `Haftada ${FREE_LESSONS_PER_WEEK} ders (testleri ve kartlarıyla), günde ${FREE_CHAT_PER_DAY} sohbet mesajı ve günde ${FREE_PHOTO_PER_DAY} fotoğraftan soru çözümü`;

/** Davet: iki tarafa bir kez hediye (SQL `grant_referral_gift`, 90 kredi = 3 ders). */
export const REFERRAL_GIFT_LESSONS = 3;
/** Davet eden en çok bu kadar davet için hediye alır (SQL `grant_referral_gift`, `referral_counted`). */
export const REFERRAL_MAX_INVITES = 3;
