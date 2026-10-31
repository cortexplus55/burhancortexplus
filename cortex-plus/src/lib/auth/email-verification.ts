import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { appOrigin } from "@/lib/app-url";
import { sendVerifyEmail } from "@/lib/email/mailer";

/*
  "Hemen gir, içeride onayla" (31 Ekim 2026, ürün sahibinin kararı — Paket J1 #1).

  E-posta ve şifreyle kayıt olan öğrenci doğrulama ekranında beklemez: hesap sunucuda açılır (`/api/auth/signup`,
  Supabase'in yönetici ucu), öğrenci hemen içeri girer. Neden Supabase'in "Confirm email" ayarını kapatmadık: o ayar
  kapanınca her hesap anında "doğrulanmış" sayılır (davet hediyesi çiftliği geri gelir) ve ayar bir güvenlik ayarı.
  Bunun yerine hesap `app_metadata.email_unverified = true` ile açılır: SQL `account_verified` bu bayrağı görünce
  hesabı doğrulanmamış sayar (davet hediyesi yok; göç 20261031180000). Doğrulama bağlantısı bizim posta hattımızdan
  gider (Supabase'in saatte 30 e-posta sınırına takılmaz), imzalı ve 7 gün geçerlidir; tıklanınca bayrak kalkar.

  `app_metadata`'yı yalnız sunucu (servis anahtarı) yazabilir; öğrenci kendi bayrağını kaldıramaz.
*/

export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const UNVERIFIED_FLAG = "email_unverified";

function secret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`email-verify:${payload}`).digest("hex");
}

function emailKey(email: string): string {
  return createHmac("sha256", "email").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** `<kullanıcı>.<e-posta özeti>.<bitiş>.<imza>` — e-posta adresi bağlantıda açık yazılmaz. */
export function verifyEmailToken(userId: string, email: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = `${userId}.${emailKey(email)}.${now + VERIFY_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

export function readEmailToken(
  token: string | null | undefined,
  now = Date.now(),
): { userId: string; emailKey: string } | null {
  const key = secret();
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, mail, expires, signature] = parts as [string, string, string, string];
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f]{16}$/.test(mail)) return null;
  const until = Number(expires);
  if (!Number.isFinite(until) || until < now) return null;
  const expected = sign(`${userId}.${mail}.${expires}`, key);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, emailKey: mail };
}

export function tokenMatchesEmail(token: { emailKey: string }, email: string): boolean {
  return token.emailKey === emailKey(email);
}

export function isEmailUnverified(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.[UNVERIFIED_FLAG] === true;
}

export function verifyEmailUrl(token: string): string {
  return `${appOrigin()}/api/auth/eposta-dogrula?t=${encodeURIComponent(token)}`;
}

/** Doğrulama e-postasını gönderir; anahtar yoksa ya da posta gitmezse false (kayıt yine sürer). */
export async function sendVerification(input: { userId: string; email: string; name: string }): Promise<boolean> {
  const token = verifyEmailToken(input.userId, input.email);
  if (!token) return false;
  const result = await sendVerifyEmail({ to: input.email, name: input.name, url: verifyEmailUrl(token) }).catch(() => ({ ok: false }));
  return result.ok;
}

/** Bayrağı kaldırır (öbür `app_metadata` alanları korunur). */
export async function markEmailVerified(service: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const current = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  if (!isEmailUnverified(current)) return true;
  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    app_metadata: { ...current, [UNVERIFIED_FLAG]: false },
  });
  return !updateError;
}
