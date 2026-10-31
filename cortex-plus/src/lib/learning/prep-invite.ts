import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { appOrigin } from "@/lib/app-url";

/**
 * Sınıf davet bağlantısı (31 Ekim 2026, Paket J3 #14). Bağlantı durum taşımaz: hazırlık ve son geçerlilik
 * `APP_SECRET` ile imzalı (velime ödeme linki ve e-posta doğrulamasıyla aynı yöntem). İmza bozulursa ya da süre
 * geçerse açılmaz; hazırlık kimliğini tahmin eden biri başkasının hazırlığını kopyalayamaz. Davet eden öğrencinin
 * kimliği bağlantıda yok (sahibi katılımda hazırlıktan okunur). 30 gün geçerli; son geçerlilik saate yuvarlanır,
 * aynı saat içinde bağlantı aynı kalır.
 */
export const PREP_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PREFIX = "sinif";

function secret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`prep-invite:${payload}`).digest("base64url");
}

export type PrepInviteClaims = { prepId: string; expiresAt: number };

/** `sinif.<hazırlık>.<bitiş>.<imza>` — URL'de güvenli karakterler. Sır yoksa null (düğme görünmez). */
export function createPrepInviteToken(prepId: string, now = Date.now()): string | null {
  const key = secret();
  if (!key || !/^[0-9a-f-]{36}$/i.test(prepId)) return null;
  const expiresAt = Math.ceil((now + PREP_INVITE_TTL_MS) / HOUR_MS) * HOUR_MS;
  const payload = [PREFIX, prepId.toLowerCase(), String(expiresAt)].join(".");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyPrepInviteToken(
  token: string | null | undefined,
  now = Date.now(),
): { ok: true; claims: PrepInviteClaims } | { ok: false; reason: "invalid" | "expired" | "unconfigured" } {
  const key = secret();
  if (!key) return { ok: false, reason: "unconfigured" };
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, reason: "invalid" };
  const [, prepId, expires, signature] = parts as [string, string, string, string];
  if (!/^[0-9a-f-]{36}$/.test(prepId) || !/^\d{10,16}$/.test(expires)) return { ok: false, reason: "invalid" };
  const expected = sign([PREFIX, prepId, expires].join("."), key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  const expiresAt = Number(expires);
  if (expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, claims: { prepId, expiresAt } };
}

export function prepInvitePath(token: string): string {
  return `/hazirlik-davet/${token}`;
}

/** Mutlak bağlantı: WhatsApp metnine göreli adres girmez (düello paylaşımında yaşanan hata). */
export function prepInviteUrl(token: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/$/, "")}${prepInvitePath(token)}`;
}

/** Misafirin kayıt adresi: davet edenin kodu (ikisine de davet hediyesi) ve dönüş adresi korunur. */
export function prepInviteSignupHref(token: string, referralCode: string | null | undefined): string {
  const params = new URLSearchParams();
  const code = (referralCode ?? "").trim();
  if (/^[A-Za-z0-9]{4,16}$/.test(code)) params.set("ref", code.toUpperCase());
  params.set("next", prepInvitePath(token));
  return `/kayit?${params.toString()}`;
}
