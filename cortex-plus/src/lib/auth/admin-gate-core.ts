import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/*
  "🔐 Kurucu Yönetim Girişi" kapısının saf çekirdeği (6 Kasım 2026): PIN özeti ve kapı çerezi.

  PIN düz metin saklanmaz. Vercel'deki `ADMIN_GATE_PIN_HASH` şu biçimde bir scrypt özetidir:

      scrypt$<N>$<r>$<p>$<tuz, base64url>$<özet, base64url>

  Üreten komut: `node scripts/admin-pin-hash.mjs` (PIN'i sorar, satırı yazar). Aynı biçimi
  `hashAdminPin` da üretir; testler ikisinin birbirini doğruladığını tutar.

  Kapı çerezi: `v1.<kullanıcı>.<bitiş ms>.<imza>`; imza HMAC-SHA256(APP_SECRET, kullanıcı + bitiş +
  PIN özetinin parmak izi). Başka kullanıcıya taşınamaz, süresi 12 saat, PIN değişince eski çerezler ölür.
*/

export const ADMIN_GATE_COOKIE = "cp_admin_gate";
export const ADMIN_GATE_TTL_MS = 12 * 60 * 60 * 1000;
/** Yanlış PIN: 10 dakikada en çok 5 deneme. */
export const ADMIN_GATE_MAX_FAILURES = 5;
export const ADMIN_GATE_FAILURE_WINDOW_SECONDS = 10 * 60;

export const ADMIN_PIN_MIN_LENGTH = 6;
export const ADMIN_PIN_MAX_LENGTH = 64;

const SCRYPT_DEFAULTS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
/** Kabul edilen en büyük parametreler: bozuk ya da kötü niyetli bir özet sunucuyu kilitlemesin. */
const MAX_N = 1 << 20;

export type PinHash = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function isPowerOfTwo(n: number): boolean {
  return n > 1 && (n & (n - 1)) === 0;
}

/** `ADMIN_GATE_PIN_HASH` satırını okur; biçim tutmazsa null. */
export function parsePinHash(raw: string | null | undefined): PinHash | null {
  if (!raw) return null;
  const parts = raw.trim().split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map((part) => Number(part));
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (!isPowerOfTwo(N) || N > MAX_N || r < 1 || r > 32 || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const hash = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length < 16 || hash.length < 16) return null;
  return { N, r, p, salt, hash };
}

function derive(pin: string, spec: Omit<PinHash, "hash">, length: number): Buffer {
  return scryptSync(pin.normalize("NFKC"), spec.salt, length, {
    N: spec.N,
    r: spec.r,
    p: spec.p,
    maxmem: 256 * spec.N * spec.r + 1024 * 1024,
  });
}

/** Yeni özet satırı (betik ve testler). */
export function hashAdminPin(pin: string, salt: Buffer, params: { N: number; r: number; p: number } = SCRYPT_DEFAULTS): string {
  const hash = derive(pin, { ...params, salt }, KEY_LENGTH);
  return `scrypt$${params.N}$${params.r}$${params.p}$${b64url(salt)}$${b64url(hash)}`;
}

/** PIN özetle tutuyor mu; sabit süreli karşılaştırma. */
export function verifyAdminPin(pin: string, stored: PinHash): boolean {
  if (typeof pin !== "string") return false;
  const trimmed = pin.trim();
  if (trimmed.length < ADMIN_PIN_MIN_LENGTH || trimmed.length > ADMIN_PIN_MAX_LENGTH) return false;
  const candidate = derive(trimmed, stored, stored.hash.length);
  return candidate.length === stored.hash.length && timingSafeEqual(candidate, stored.hash);
}

/** PIN özetinin parmak izi: PIN değişince eski kapı çerezleri geçersizleşir. */
export function pinFingerprint(stored: PinHash): string {
  return createHash("sha256").update(stored.salt).update(stored.hash).digest("base64url").slice(0, 16);
}

function signature(userId: string, expiresAt: number, secret: string, fingerprint: string): string {
  return createHmac("sha256", secret)
    .update(`admin-gate:v1:${userId}:${expiresAt}:${fingerprint}`)
    .digest("base64url");
}

export function signAdminGateCookie(input: {
  userId: string;
  now: number;
  secret: string;
  fingerprint: string;
}): string {
  const expiresAt = input.now + ADMIN_GATE_TTL_MS;
  return `v1.${input.userId}.${expiresAt}.${signature(input.userId, expiresAt, input.secret, input.fingerprint)}`;
}

/** Çerez bu kullanıcıya ait, süresi geçmemiş ve imzası doğru mu. */
export function verifyAdminGateCookie(
  value: string | null | undefined,
  input: { userId: string; now: number; secret: string; fingerprint: string },
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [, userId, expiresRaw, sig] = parts as [string, string, string, string];
  if (userId !== input.userId) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isInteger(expiresAt) || expiresAt <= input.now) return false;
  // Gelecekte 12 saatten uzun ömürlü çerez imzalanmış olamaz (saat kayması payı 5 dk).
  if (expiresAt > input.now + ADMIN_GATE_TTL_MS + 5 * 60 * 1000) return false;
  const expected = Buffer.from(signature(userId, expiresAt, input.secret, input.fingerprint));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type AdminGateConfig =
  | { state: "off" }
  | { state: "misconfigured"; reason: "pin_hash_invalid" | "secret_missing" }
  | { state: "on"; pin: PinHash; secret: string; fingerprint: string };

/**
 * Ortam değişkenlerinden kapı ayarı. PIN özeti yoksa kapı KAPALI (panel kilitlenmez, üstte uyarı).
 * Özet var ama okunamıyorsa ya da imza anahtarı yoksa kapı "bozuk" sayılır ve panel KAPALI kalır:
 * kurucu bir PIN tanımladığına göre sessizce açık bırakılmaz.
 */
export function adminGateConfigFrom(env: {
  ADMIN_GATE_PIN_HASH?: string | null;
  APP_SECRET?: string | null;
  SUPABASE_SECRET_KEY?: string | null;
}): AdminGateConfig {
  const raw = env.ADMIN_GATE_PIN_HASH?.trim();
  if (!raw) return { state: "off" };
  const pin = parsePinHash(raw);
  if (!pin) return { state: "misconfigured", reason: "pin_hash_invalid" };
  const secret = env.APP_SECRET || env.SUPABASE_SECRET_KEY || "";
  if (!secret) return { state: "misconfigured", reason: "secret_missing" };
  return { state: "on", pin, secret, fingerprint: pinFingerprint(pin) };
}
