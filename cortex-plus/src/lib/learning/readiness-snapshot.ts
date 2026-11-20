import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Sınav öncesi hazırlık puanının imzalı anlık görüntüsü (Faz 7, 20 Kasım 2026). Hazırlık sayfası "Hazırlık" puanını
 * (`progressView.scorePct`, sayfanın gösterdiği sayı) sunucuda imzalar; "🎓 Sınavın Nasıl Geçti?" kartı gönderirken
 * belirteci geri yollar. Sunucu puanı belirteçten okur: tarayıcı kendi "hazırlık puanını" yazamaz, uç da puanı
 * yeniden hesaplamak için sayfanın bütün okumalarını tekrarlamaz. Belirteç hazırlığa ve öğrenciye bağlı, 14 gün
 * geçerli (`APP_SECRET`, sınıf daveti ve veli bağlantısıyla aynı yöntem). Sır yoksa belirteç yok, puan boş kalır.
 */

export const READINESS_SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const PREFIX = "hazirlik";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`readiness-snapshot:${payload}`).digest("base64url");
}

/** `hazirlik.<hazırlık>.<öğrenci>.<puan>.<bitiş>.<imza>`; geçersiz girdide ya da sır yoksa null. */
export function createReadinessToken(
  input: { prepId: string; userId: string; pct: number },
  now = Date.now(),
): string | null {
  const key = secret();
  const prepId = input.prepId.toLowerCase();
  const userId = input.userId.toLowerCase();
  if (!key || !UUID_RE.test(prepId) || !UUID_RE.test(userId)) return null;
  if (!Number.isFinite(input.pct) || input.pct < 0 || input.pct > 100) return null;
  const payload = [PREFIX, prepId, userId, String(Math.round(input.pct)), String(now + READINESS_SNAPSHOT_TTL_MS)].join(".");
  return `${payload}.${sign(payload, key)}`;
}

/** Belirteç bu hazırlığın ve bu öğrencinin, imzası tutuyor ve süresi geçmemişse puan; değilse null. */
export function readReadinessToken(
  token: string | null | undefined,
  expected: { prepId: string; userId: string },
  now = Date.now(),
): number | null {
  const key = secret();
  if (!key || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [, prepId, userId, pct, expires, signature] = parts as [string, string, string, string, string, string];
  if (prepId !== expected.prepId.toLowerCase() || userId !== expected.userId.toLowerCase()) return null;
  if (!/^\d{1,3}$/.test(pct) || !/^\d{10,16}$/.test(expires)) return null;
  const want = Buffer.from(sign([PREFIX, prepId, userId, pct, expires].join("."), key));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(expires) <= now) return null;
  const value = Number(pct);
  return value >= 0 && value <= 100 ? value : null;
}
