/*
  Harcama sigortasının istemciye de gidebilen sabitleri (5 Kasım 2026). Sunucu mantığı `spend-breaker.ts`'te
  (server-only); kokpit formu ve ekran metinleri yalnız bunları okur.
*/

export const SPEND_CAP_FLAG = "admin_ai_daily_cap";
export const DEFAULT_DAILY_SPEND_CAP_USD = 25;
export const SPEND_CAP_MIN_USD = 1;
export const SPEND_CAP_MAX_USD = 10_000;
export const SPEND_CAP_CODE = "spend_cap_free";
export const SPEND_CAP_MESSAGE =
  "⚡ Yoğun sınav trafiği nedeniyle şu an yalnız Hazır Müfredat Havuzu ve Plus üyelerimiz için anlık AI üretimi aktiftir.";
export const SPEND_CAP_POOL_HREF = "/mufredat";

export type SpendCapSource = "flag" | "env" | "default";
export type SpendCap = { capUsd: number; source: SpendCapSource };

/** Tavan değeri: sayı ya da sayı metni, aralık içinde; değilse null. */
export function readCapValue(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(parsed) && parsed >= SPEND_CAP_MIN_USD && parsed <= SPEND_CAP_MAX_USD ? parsed : null;
}

/** Tavan: bayrak → ortam → varsayılan. Aralık dışı ya da bozuk değer bir sonraki kaynağa düşer. */
export function resolveSpendCap(input: { flagMetadata: unknown; envValue: string | undefined }): SpendCap {
  const fromFlag = readCapValue((input.flagMetadata as { cap_usd?: unknown } | null | undefined)?.cap_usd);
  if (fromFlag != null) return { capUsd: fromFlag, source: "flag" };
  const fromEnv = readCapValue(input.envValue);
  if (fromEnv != null) return { capUsd: fromEnv, source: "env" };
  return { capUsd: DEFAULT_DAILY_SPEND_CAP_USD, source: "default" };
}

/** Anahtar: `AI_SPEND_BREAKER` on/off; verilmemişse Vercel'de açık, yerelde ve testte kapalı. */
export function breakerSwitch(env: Record<string, string | undefined> = process.env): boolean {
  const flag = (env.AI_SPEND_BREAKER ?? "").trim().toLowerCase();
  if (flag === "on" || flag === "1" || flag === "true") return true;
  if (flag === "off" || flag === "0" || flag === "false") return false;
  return Boolean(env.VERCEL_ENV);
}

/** Sigorta atmış mı: gider okunduysa ve tavana ulaştıysa. Okunamadıysa (null) atmaz. */
export function breakerTripped(spentUsd: number | null, cap: SpendCap): boolean {
  return spentUsd != null && Number.isFinite(spentUsd) && spentUsd >= cap.capUsd;
}
