import { PROMO_CODE_PATTERN, normalizePromoCode } from "@/lib/billing/promo-codes";

/*
  Yönetim panelindeki "Yeni kod oluştur" formunun doğrulaması (6 Kasım 2026). İstemci (düğmeyi kilitlemek ve
  hatayı söylemek için) ve sunucu eylemi aynı işlevi kullanır; sunucu tek başına yetkilidir.

  Bir kod tek tür hak verir: X gün Plus ya da +Y hediye kredi. `redeem_promo_code` ikisini aynı anda da
  uygulayabilir, ama panel bunu sunmaz: öğrenciye giden mesaj ve kontenjan anlamı tek türle açık kalır.
  Plus günü `promo_codes.plus_days` sınırıyla aynı (1–90). Kod boş bırakılırsa sunucu üretir.
*/

export type PromoGrant = "plus" | "credit";

export const PROMO_PLUS_DAYS_MIN = 1;
export const PROMO_PLUS_DAYS_MAX = 90;
export const PROMO_CREDIT_MIN = 1;
/** Hediye kredinin üst sınırı: Plus'ın bir aylık hakkı 7.200; yanlış yazılan sıfır bütün bütçeyi dağıtmasın. */
export const PROMO_CREDIT_MAX = 10_000;
export const PROMO_USES_MIN = 1;
export const PROMO_USES_MAX = 1000;
/** Son kullanma tarihi en çok bu kadar gün ileride. */
export const PROMO_EXPIRY_MAX_DAYS = 730;
/** Kod boşken üretilen kodun öneki. */
export const PROMO_PREFIX: Record<PromoGrant, string> = { plus: "PLUS", credit: "HEDIYE" };

export type PromoFormInput = {
  code?: string | null;
  grant: PromoGrant;
  amount: number;
  maxUses: number;
  /** "YYYY-AA-GG" (tarih kutusu); boş = süresiz. */
  expiresOn?: string | null;
};

export type PromoSpec = {
  /** Boşsa sunucu üretir. */
  code: string | null;
  grant: PromoGrant;
  plusDays: number | null;
  credits: number;
  maxUses: number;
  /** Seçilen günün sonu, Türkiye saatiyle (23:59:59); süresizse null. */
  expiresAt: string | null;
};

export type PromoFormResult = { ok: true; spec: PromoSpec } | { ok: false; error: string };

const ISTANBUL_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** "2026-12-31" → o günün Türkiye saatiyle son saniyesi (ISO); geçersizse null. */
export function promoExpiryIso(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, date, 23, 59, 59);
  const check = new Date(Date.UTC(year, month - 1, date));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  return new Date(utc - ISTANBUL_OFFSET_MS).toISOString();
}

export function validatePromoForm(input: PromoFormInput, now: Date = new Date()): PromoFormResult {
  const rawCode = (input.code ?? "").trim();
  const code = rawCode ? normalizePromoCode(rawCode) : null;
  if (code !== null && !PROMO_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Kod 3–40 karakter olmalı; yalnız harf (A–Z, Türkçe harf yok), rakam ve tire." };
  }
  if (input.grant !== "plus" && input.grant !== "credit") return { ok: false, error: "Hak türünü seç: Plus günü ya da hediye kredi." };

  const amount = Number(input.amount);
  if (input.grant === "plus") {
    if (!Number.isInteger(amount) || amount < PROMO_PLUS_DAYS_MIN || amount > PROMO_PLUS_DAYS_MAX) {
      return { ok: false, error: `Plus günü ${PROMO_PLUS_DAYS_MIN} ile ${PROMO_PLUS_DAYS_MAX} arasında tam sayı olmalı.` };
    }
  } else if (!Number.isInteger(amount) || amount < PROMO_CREDIT_MIN || amount > PROMO_CREDIT_MAX) {
    return { ok: false, error: `Hediye kredi ${PROMO_CREDIT_MIN} ile ${PROMO_CREDIT_MAX.toLocaleString("tr-TR")} arasında tam sayı olmalı.` };
  }

  const maxUses = Number(input.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < PROMO_USES_MIN || maxUses > PROMO_USES_MAX) {
    return { ok: false, error: `En çok kullanım ${PROMO_USES_MIN} ile ${PROMO_USES_MAX.toLocaleString("tr-TR")} arasında tam sayı olmalı.` };
  }

  let expiresAt: string | null = null;
  const day = (input.expiresOn ?? "").trim();
  if (day) {
    expiresAt = promoExpiryIso(day);
    if (!expiresAt) return { ok: false, error: "Son kullanma tarihi geçerli bir gün değil." };
    const at = Date.parse(expiresAt);
    if (at <= now.getTime()) return { ok: false, error: "Son kullanma tarihi geçmiş; bugün ya da sonrası olmalı." };
    if (at - now.getTime() > PROMO_EXPIRY_MAX_DAYS * DAY_MS) {
      return { ok: false, error: `Son kullanma tarihi en çok ${PROMO_EXPIRY_MAX_DAYS} gün ileride olabilir.` };
    }
  }

  return {
    ok: true,
    spec: {
      code,
      grant: input.grant,
      plusDays: input.grant === "plus" ? amount : null,
      credits: input.grant === "credit" ? amount : 0,
      maxUses,
      expiresAt,
    },
  };
}

export type PromoStatus = { label: string; tone: "ok" | "warn" | "bad" | "mute" };

/** Listedeki durum rozeti: Pasif → süresi doldu → kontenjan doldu → Aktif. */
export function promoStatus(
  row: { active: boolean; expires_at: string | null; max_redemptions: number | null; redemption_count: number },
  now: Date = new Date(),
): PromoStatus {
  if (!row.active) return { label: "Pasif", tone: "mute" };
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return { label: "Süresi doldu", tone: "bad" };
  if (row.max_redemptions !== null && row.redemption_count >= row.max_redemptions) return { label: "Kontenjan doldu", tone: "warn" };
  return { label: "Aktif", tone: "ok" };
}

/** "3 / 50 · kalan 47" ya da eski sınırsız kodda "3 / sınırsız". */
export function promoUsage(row: { max_redemptions: number | null; redemption_count: number }): string {
  const used = row.redemption_count.toLocaleString("tr-TR");
  if (row.max_redemptions === null) return `${used} / sınırsız`;
  const left = Math.max(0, row.max_redemptions - row.redemption_count);
  return `${used} / ${row.max_redemptions.toLocaleString("tr-TR")} · kalan ${left.toLocaleString("tr-TR")}`;
}

/** Hak: "14 gün Plus" ya da "+500 kredi" (ikisi birden olan eski kod ikisini de yazar). */
export function promoGrantLabel(row: { plus_days?: number | null; credit_amount: number }): string {
  const parts: string[] = [];
  if (row.plus_days) parts.push(`${row.plus_days} gün Plus`);
  if (row.credit_amount > 0) parts.push(`+${row.credit_amount.toLocaleString("tr-TR")} kredi`);
  return parts.join(" + ") || "—";
}
