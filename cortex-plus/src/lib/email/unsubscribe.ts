import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/app-url";

/*
  Tek tıkla abonelikten çıkış (7 Kasım 2026). Ticari Elektronik İletiler Hakkında Yönetmelik her kampanya iletisinde
  ücretsiz ve kolay "ret hakkı" ister; hatırlatma e-postalarında da aynı kolaylık sunulur. Bağlantı hesapla
  eşleşir ve oturum gerektirmez: e-postadaki bağlantıya dokunan, giriş yapmadan çıkabilmeli.

  Bağlantı imzalıdır (`APP_SECRET`, HMAC-SHA256); süresi dolmaz (çıkış hakkı her zaman çalışmalı), yalnız kendi
  hesabını ve kendi kategorisini kapatır. Anahtar yoksa bağlantı üretilmez: o zaman abonelikten çıkış sunulamayan
  hiçbir ileti gönderilmez (çağıran `null` görür ve göndermez).
*/

export type EmailCategory = "marketing" | "reminder";
const CATEGORIES: readonly EmailCategory[] = ["marketing", "reminder"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.APP_SECRET?.trim();
  return key && key.length >= 16 ? key : null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`email-unsub:${payload}`).digest("base64url");
}

/** `<kullanıcı>.<kategori>.<imza>` — adreste güvenli karakterler. Anahtar yoksa `null`. */
export function signUnsubscribeToken(
  userId: string,
  category: EmailCategory,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = secret(env);
  if (!key || !UUID.test(userId) || !CATEGORIES.includes(category)) return null;
  const payload = `${userId}.${category}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): { userId: string; category: EmailCategory } | null {
  const key = secret(env);
  if (!key) return null;
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const [userId, category, signature] = parts as [string, string, string];
  if (!UUID.test(userId) || !CATEGORIES.includes(category as EmailCategory)) return null;
  const expected = sign(`${userId}.${category}`, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, category: category as EmailCategory };
}

/** E-postadaki bağlantının açtığı sayfa (onay düğmesi orada). */
export function unsubscribePageUrl(token: string): string {
  return `${appOrigin()}/eposta/abonelik?t=${encodeURIComponent(token)}`;
}

/** Posta uygulamasının "abonelikten çık" düğmesinin çağırdığı adres (RFC 8058, tek tıkla POST). */
export function unsubscribeApiUrl(token: string): string {
  return `${appOrigin()}/api/email/abonelik?t=${encodeURIComponent(token)}`;
}

export function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeApiUrl(token)}>, <mailto:cortexplus@cortexplus.app?subject=abonelik>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
