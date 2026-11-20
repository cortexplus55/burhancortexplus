import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { parentPackageLabel } from "@/lib/payments/parent-link-plan";
import { PARENT_LINK_TTL_MS } from "@/lib/payments/parent-link-ttl";

/**
 * Velime ödeme linki (29 Ekim 2026, ürün sahibinin kararı). Kartı yanında olmayan öğrenci, seçtiği
 * plan için imzalı bir bağlantı üretir; veli hesap açmadan bağlantıyı açar, sözleşmeyi onaylar ve PayTR
 * iFrame'inde öder; hak öğrencinin hesabına tanımlanır (`payments.user_id` = öğrenci; geri çağrı
 * aynı yoldan). Bağlantı durum taşımaz: öğrenci, plan, son geçerlilik ve tek kullanımlık ek HMAC ile
 * imzalıdır (HMAC-SHA256); imza bozulursa ya da süre geçerse açılmaz.
 *
 * Faz 5 §2 (19 Kasım 2026, Burhan'ın kararı): bağlantı 48 saat geçerli; adres `/veli-odeme/<belirteç>`; WhatsApp
 * metni öğrencinin ağzından, harfiyen `parentShareText`te.
 */
export { PARENT_LINK_TTL_MS };
/** Velinin herkese açık ödeme sayfası. Eski `/odeme/veli/<belirteç>` adresi buraya yönlenir. */
export const PARENT_PAY_PATH = "/veli-odeme";
const PREFIX = "veli";

/**
 * Yalnız `APP_SECRET` (6 Kasım 2026). Ödeme bağlantısı para hareketi açtığı için servis anahtarına
 * düşmez: anahtar yoksa bağlantı üretilmez ve doğrulanmaz ("unconfigured"), kapı kapalı kalır.
 */
function secret(): string | null {
  const key = env.APP_SECRET?.trim();
  if (!key) {
    console.error("parent_link_secret_missing", { reason: "APP_SECRET is not set" });
    return null;
  }
  return key;
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

/** Belirtecin üretildiği an (bitişten geriye 48 saat): ödeme durumunu bu andan sonraki satırlarda ararız. */
export function parentLinkIssuedAt(claims: Pick<ParentPayClaims, "expiresAt">): number {
  return claims.expiresAt - PARENT_LINK_TTL_MS;
}

/** Velinin açacağı tam adres: `https://cortexplus.app/veli-odeme/<belirteç>`. */
export function parentPayUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}${PARENT_PAY_PATH}/${token}`;
}

/**
 * Velinin WhatsApp'ta göreceği metin (Faz 5 §2, harfiyen): öğrencinin ağzından, paket adı ve bağlantı yerinde.
 */
export function parentShareText(input: { planName: string; url: string }): string {
  return `Anne/Baba, sınav hazırlığım için kullandığım paketi (${parentPackageLabel(input.planName)}) bu güvenli PayTR bağlantısından şifre girmeden onaylayabilir misin? ${input.url}`;
}

/**
 * Velinin sayfasında öğrencinin e-postası maskeli (Faz 5 §2): yerel kısmın ilk iki harfi ve alan adının ilk harfi,
 * gerisi yıldız; uzantı açık. "ornek.ogrenci@site.com" → "or***@s***.com".
 */
export function maskEmail(email: string | null | undefined): string | null {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot < 1) return null;
  const host = domain.slice(0, dot);
  const tld = domain.slice(dot);
  return `${local.slice(0, Math.min(2, local.length))}***@${host.slice(0, 1)}***${tld}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Bağlantının bitişini söyleyen satır ("Bağlantı 48 saat geçerli."). */
export function parentLinkValidityLine(expiresAt: number, now = Date.now()): string {
  const hours = Math.max(1, Math.ceil((expiresAt - now) / (60 * 60 * 1000)));
  return `Bağlantı ${hours} saat geçerli.`;
}

/** Süresi geçmiş bağlantıda velinin gördüğü cümle (Faz 5 §2, harfiyen). */
export const PARENT_LINK_EXPIRED_TEXT = "Bu ödeme bağlantısının süresi dolmuş, öğrencinizden yeni link isteyebilirsiniz";
