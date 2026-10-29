import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Velime ödeme linki (29 Ekim 2026, ürün sahibinin kararı). Kartı yanında olmayan öğrenci, seçtiği
 * plan için imzalı bir bağlantı üretir; veli hesap açmadan bağlantıyı açar, sözleşmeyi onaylar ve PayTR
 * iFrame'inde öder; hak öğrencinin hesabına tanımlanır (`payments.user_id` = öğrenci; geri çağrı
 * aynı yoldan). Bağlantı durum taşımaz: öğrenci, plan, son geçerlilik ve tek kullanımlık ek HMAC ile
 * imzalıdır; imza bozulursa ya da süre geçerse açılmaz. 3 gün geçerli.
 */
export const PARENT_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PREFIX = "veli";

function secret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`parent-pay:${payload}`).digest("base64url");
}

export type ParentPayClaims = { studentId: string; planId: string; expiresAt: number; nonce: string };

/** `veli.<öğrenci>.<plan>.<bitiş>.<nonce>.<imza>` — URL'de güvenli karakterler. */
export function createParentPayToken(
  input: { studentId: string; planId: string },
  now = Date.now(),
  nonce = randomBytes(6).toString("base64url"),
): string | null {
  const key = secret();
  if (!key) return null;
  const payload = [PREFIX, input.studentId, input.planId, String(now + PARENT_LINK_TTL_MS), nonce].join(".");
  return `${payload}.${sign(payload, key)}`;
}

/** Geçerli imza ve süre → iddialar; aksi hâlde neden. */
export function verifyParentPayToken(
  token: string | null | undefined,
  now = Date.now(),
): { ok: true; claims: ParentPayClaims } | { ok: false; reason: "invalid" | "expired" | "unconfigured" } {
  const key = secret();
  if (!key) return { ok: false, reason: "unconfigured" };
  const parts = String(token ?? "").split(".");
  if (parts.length !== 6 || parts[0] !== PREFIX) return { ok: false, reason: "invalid" };
  const [, studentId, planId, expires, nonce, signature] = parts as [string, string, string, string, string, string];
  const payload = [PREFIX, studentId, planId, expires, nonce].join(".");
  const expected = sign(payload, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "invalid" };
  if (expiresAt <= now) return { ok: false, reason: "expired" };
  if (!/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(planId)) return { ok: false, reason: "invalid" };
  return { ok: true, claims: { studentId, planId, expiresAt, nonce } };
}

/** Velinin WhatsApp'ta göreceği metin; bağlantı en sonda. */
export function parentShareText(input: { studentName: string; planName: string; priceLabel: string; url: string }): string {
  return (
    `Merhaba, ${input.studentName} için Cortex Plus ${input.planName} (${input.priceLabel}) almak istiyorum. ` +
    `Bu bağlantıdan hesap açmadan güvenli ödeme yapabilirsin; paket benim hesabıma tanımlanır: ${input.url}`
  );
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Bağlantının bitişini öğrenciye söyleyen satır ("3 gün geçerli"). */
export function parentLinkValidityLine(expiresAt: number, now = Date.now()): string {
  const days = Math.max(1, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
  return days === 1 ? "Bağlantı bugün geçerli." : `Bağlantı ${days} gün geçerli.`;
}
