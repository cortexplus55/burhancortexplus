import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPremiumUser } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { dailyKey, peekCount, rateLimit } from "@/lib/rate-limit";

/*
  Okunamayan fotoğraf döngüsü (5 Kasım 2026, lansman zırhı). Ücretsiz hesapta okunamayan fotoğraf iade edilir
  ve hak geri döner (23 Ekim kararı; dürüst). Ama her deneme bir görüntü modeli çağrısıdır: bozuk fotoğrafı
  arka arkaya yükleyen bir bot günde yüzlerce bedava Vision çağrısı yaptırabilir. Kural: ücretsiz hesapta aynı
  gün 3 okunamayan fotoğraftan sonra o günkü fotoğraf denemeleri durur (402 `free_photo_abuse_limit`); abone ve
  kurucu etkilenmez. Sayaç Redis'te günlük anahtar (Redis yoksa bellek yedeği); iade politikası değişmez.
*/

export const PHOTO_UNREADABLE_DAILY_LIMIT = 3;
export const PHOTO_ABUSE_CODE = "free_photo_abuse_limit";
export const PHOTO_ABUSE_MESSAGE =
  "Bugün 3 fotoğraf okunamadı; ücretsiz hesapta fotoğraf denemesi yarın yenilenir. Net ve iyi aydınlatılmış bir fotoğrafla yeniden dene ya da Plus'a geç.";
const SCOPE = "photo-unreadable";
const DAY_SECONDS = 24 * 60 * 60;

export function photoUnreadableKey(userId: string, at: Date = new Date()): string {
  return dailyKey(userId, SCOPE, at);
}

/** Kararı veren saf kural: ücretsiz hesapta sayaç sınıra ulaştıysa durur. */
export function photoAttemptsBlocked(unreadableToday: number, paidOrExempt: boolean): boolean {
  return !paidOrExempt && unreadableToday >= PHOTO_UNREADABLE_DAILY_LIMIT;
}

/** Okunamayan fotoğraf: günlük sayaç bir artar. Redis düşerse bellek yedeği; hata fırlatmaz. */
export async function recordUnreadablePhoto(userId: string, at: Date = new Date()): Promise<void> {
  try {
    await rateLimit(photoUnreadableKey(userId, at), PHOTO_UNREADABLE_DAILY_LIMIT, DAY_SECONDS);
  } catch {
    // sayaç tutulamadıysa kapı kapanmaz
  }
}

export async function unreadablePhotosToday(userId: string, at: Date = new Date()): Promise<number> {
  try {
    return await peekCount(photoUnreadableKey(userId, at));
  } catch {
    return 0;
  }
}

/** Yeni fotoğraf denemesi durur mu: önce ucuz sayaç, sınırdaysa abonelik. */
export async function photoAbuseBlocked(service: SupabaseClient, userId: string, at: Date = new Date()): Promise<boolean> {
  const count = await unreadablePhotosToday(userId, at);
  if (count < PHOTO_UNREADABLE_DAILY_LIMIT) return false;
  try {
    const [premium, exempt] = await Promise.all([isPremiumUser(service, userId), billingExempt(service, userId)]);
    return photoAttemptsBlocked(count, premium || exempt);
  } catch {
    return false;
  }
}
