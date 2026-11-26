import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { DELETION_LINK_TTL_HOURS } from "@/lib/privacy/account-deletion-copy";

/**
 * Giriş yapmadan hesap silme bağlantısı (26 Kasım 2026, Google Play hesap silme politikası). Kişi `/hesap-silme`
 * formuna e-postasını yazar; hesap varsa o adrese imzalı bir bağlantı gider. Bağlantı yalnız hesabın sahibinin
 * kutusuna gittiği için başkası adına silme yapılamaz. Durum taşımaz: hesap kimliği, son geçerlilik ve tek seferlik ek
 * HMAC-SHA256 ile imzalı (`APP_SECRET`); imza bozulursa ya da süre geçerse açılmaz. Silme bir kez yapılır: ikinci
 * kullanımda hesap zaten yoktur.
 */

const PREFIX = "sil";
export const DELETION_LINK_TTL_MS = DELETION_LINK_TTL_HOURS * 60 * 60 * 1000;

function secret(): string | null {
  const key = env.APP_SECRET?.trim();
  if (!key) {
    console.error("account_deletion_secret_missing", { reason: "APP_SECRET is not set" });
    return null;
  }
  return key;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`account-delete:${payload}`).digest("base64url");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `sil.<hesap>.<bitiş>.<ek>.<imza>`; anahtar yoksa null (bağlantı üretilmez). */
export function createDeletionToken(userId: string, now: number = Date.now()): string | null {
  const key = secret();
  if (!key || !UUID.test(userId)) return null;
  const expiresAt = now + DELETION_LINK_TTL_MS;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${PREFIX}.${userId}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload, key)}`;
}

export type DeletionTokenCheck =
  | { ok: true; userId: string; expiresAt: number }
  | { ok: false; reason: "invalid" | "expired" | "unconfigured" };

export function verifyDeletionToken(token: string | null | undefined, now: number = Date.now()): DeletionTokenCheck {
  const key = secret();
  if (!key) return { ok: false, reason: "unconfigured" };
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 5 || parts[0] !== PREFIX) return { ok: false, reason: "invalid" };
  const [prefix, userId, expires, nonce, signature] = parts;
  if (!UUID.test(userId) || !/^\d{10,16}$/.test(expires) || !nonce) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(`${prefix}.${userId}.${expires}.${nonce}`, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  const expiresAt = Number(expires);
  if (expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, userId, expiresAt };
}

/** Onay sayfasında e-postanın gizlenmiş hâli: "b***@g***.com". */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? "").trim();
  const at = value.indexOf("@");
  if (at < 1) return "";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.charAt(0)}***@${host.charAt(0)}***${tld}`;
}
