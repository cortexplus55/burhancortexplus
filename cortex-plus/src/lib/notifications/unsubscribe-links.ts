import { appOrigin } from "@/lib/app-url";
import type { PreferenceKey } from "@/lib/notifications/preferences";

/**
 * Abonelikten çıkma bağlantıları (Faz 6, 20 Kasım 2026). Anahtar `user_notification_preferences.unsubscribe_token`
 * (256 bit rastgele, satırla birlikte doğar). Bağlantı oturum istemez.
 *
 *  - Sayfa: `/bildirim-tercihleri?token=…` — bütün anahtarlar, saat seçimi; GET hiçbir şeyi değiştirmez (posta
 *    uygulamaları bağlantıları önceden açar), değişiklik düğmeyle (POST).
 *  - Tek tık (RFC 8058): `POST /api/bildirim-tercihleri/abonelik?token=…&c=<anahtar>` — e-postanın kendi kategorisini
 *    kapatır. Posta uygulamasının "abonelikten çık" düğmesi bunu çağırır.
 *
 * Kampanya izni (`marketing`) ayrı kategoridir: kapatınca `email_preferences.marketing` kapanır.
 */

export type UnsubscribeCategory = PreferenceKey | "marketing";

export const UNSUBSCRIBE_CATEGORIES: readonly UnsubscribeCategory[] = [
  "studyRemindersEmail",
  "examCountdownEmail",
  "weeklyDigestEmail",
  "inAppNotifications",
  "marketing",
];

export function isUnsubscribeCategory(value: unknown): value is UnsubscribeCategory {
  return typeof value === "string" && (UNSUBSCRIBE_CATEGORIES as readonly string[]).includes(value);
}

export function preferencesPageUrl(token: string, origin: string = appOrigin()): string {
  return `${origin}/bildirim-tercihleri?token=${encodeURIComponent(token)}`;
}

export function oneClickUnsubscribeUrl(token: string, category: UnsubscribeCategory, origin: string = appOrigin()): string {
  return `${origin}/api/bildirim-tercihleri/abonelik?token=${encodeURIComponent(token)}&c=${encodeURIComponent(category)}`;
}

/** RFC 8058 başlıkları: posta uygulamasının tek tıkla çıkış düğmesi. */
export function oneClickHeaders(token: string, category: UnsubscribeCategory, origin: string = appOrigin()): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(token, category, origin)}>, <mailto:cortexplus@cortexplus.app?subject=abonelik>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
