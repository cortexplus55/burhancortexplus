import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDayStartIso } from "@/lib/admin/cockpit-math";
import { readAiSpend } from "@/lib/admin/ops-gauges";
import { isPremiumUser } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import type { FreeMeter } from "@/lib/billing/free-meters";
import {
  breakerSwitch,
  breakerTripped,
  resolveSpendCap,
  SPEND_CAP_FLAG,
  type SpendCap,
} from "@/lib/billing/spend-breaker-copy";
import { createServiceClient } from "@/lib/supabase/server";

export {
  breakerSwitch,
  breakerTripped,
  DEFAULT_DAILY_SPEND_CAP_USD,
  readCapValue,
  resolveSpendCap,
  SPEND_CAP_CODE,
  SPEND_CAP_FLAG,
  SPEND_CAP_MAX_USD,
  SPEND_CAP_MESSAGE,
  SPEND_CAP_MIN_USD,
  SPEND_CAP_POOL_HREF,
  type SpendCap,
  type SpendCapSource,
} from "@/lib/billing/spend-breaker-copy";

/*
  Küresel günlük harcama sigortası (5 Kasım 2026, lansman zırhı). "Cüzdan boşaltma": bot ya da ani viral trafik
  ücretsiz hesaplarla model çağrısı yaptırıp OpenAI faturasını şişirir. Sigorta Türkiye gününün toplam OpenAI
  giderini (`ai_usage_totals` × `ai_model_prices`, günlük özet ve kokpitle aynı hesap) tavanla karşılaştırır;
  tavan aşılınca ÜCRETSİZ hesabın maliyetli işleri (belge okuma, ders/test/podcast/sohbet üretimi, fotoğraftan
  çözüm, önceden yazım) 402 `spend_cap_free` ile durur ve öğrenci hazır müfredat havuzuna yönlendirilir.
  Plus/Sigma aboneleri ve kurucu (önizleme kapalıyken) kesintisiz sürer; derse dahil ucuz yardım (`included`
  sayacı: ders içi puanlama, koç) da durmaz — öğrenci açtığı dersin ortasında kalmasın.

  Tavan sırası: kokpit bayrağı `admin_ai_daily_cap` (metadata.cap_usd) → ortam `AI_DAILY_SPEND_CAP_USD` →
  varsayılan 25 $. Sigortanın anahtarı `AI_SPEND_BREAKER` ("on" / "off"); verilmemişse yalnız Vercel'de
  (`VERCEL_ENV` dolu) açıktır — yerelde ve birim testlerinde canlı gider okunmaz. Okuma 60 sn önbellekli, süreç
  başına; okuma düşerse sigorta ATMAZ (öğrenci kapıda kalmasın, uyarı günlüğe yazılır).
*/

export const SPEND_CACHE_MS = 60_000;

export type BreakerState = {
  enabled: boolean;
  tripped: boolean;
  spentUsd: number | null;
  cap: SpendCap;
  dayStartIso: string;
  readAt: string;
};

export async function readSpendCap(service: SupabaseClient): Promise<SpendCap> {
  try {
    const { data } = await service.from("feature_flags").select("metadata").eq("key", SPEND_CAP_FLAG).maybeSingle();
    return resolveSpendCap({ flagMetadata: (data as { metadata?: unknown } | null)?.metadata, envValue: process.env.AI_DAILY_SPEND_CAP_USD });
  } catch {
    return resolveSpendCap({ flagMetadata: null, envValue: process.env.AI_DAILY_SPEND_CAP_USD });
  }
}

let cache: { state: BreakerState; at: number } | null = null;

/** Test ve tavan kaydı: önbelleği boşaltır. */
export function resetSpendBreakerForTests() {
  cache = null;
}

/** Bugünkü durum; 60 sn önbellekli. `service` verilmezse sigorta kendi servis istemcisini açar. */
export async function spendBreakerState(
  service?: SupabaseClient,
  now: Date = new Date(),
  options: { fresh?: boolean } = {},
): Promise<BreakerState> {
  if (!options.fresh && cache && now.getTime() - cache.at < SPEND_CACHE_MS) return cache.state;
  const enabled = breakerSwitch();
  const dayStartIso = istanbulDayStartIso(now);
  const client = service ?? createServiceClient();
  const [cap, spend] = await Promise.all([readSpendCap(client), readAiSpend(client, dayStartIso).catch(() => null)]);
  if (!spend) console.warn("spend_breaker_unreadable", { dayStartIso });
  const state: BreakerState = {
    enabled,
    tripped: enabled && breakerTripped(spend?.usd ?? null, cap),
    spentUsd: spend?.usd ?? null,
    cap,
    dayStartIso,
    readAt: now.toISOString(),
  };
  cache = { state, at: now.getTime() };
  return state;
}

/**
 * Bu kullanıcının bu işi durur mu: sigorta açık ve atmış, iş derse dahil ucuz yardım değil, kullanıcı ücretsiz
 * (abone değil, muaf kurucu değil). Durum okunamazsa durmaz.
 */
export async function spendBreakerBlocks(
  service: SupabaseClient,
  userId: string,
  options: { meter?: FreeMeter | null } = {},
): Promise<boolean> {
  if (!breakerSwitch()) return false;
  if (options.meter === "included") return false;
  try {
    const state = await spendBreakerState();
    if (!state.tripped) return false;
    const [premium, exempt] = await Promise.all([isPremiumUser(service, userId), billingExempt(service, userId)]);
    return !(premium || exempt);
  } catch (error) {
    console.warn("spend_breaker_check_failed", { cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return false;
  }
}
