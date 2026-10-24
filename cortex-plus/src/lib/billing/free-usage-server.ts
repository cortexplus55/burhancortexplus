import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FREE_LIMITS,
  VISIBLE_FREE_METERS,
  freeMeterResetsAt,
  freePeriodKey,
  type FreeMeterView,
} from "@/lib/billing/free-meters";

/**
 * Ücretsiz sayaçların bu dönemdeki durumu (24 Ekim 2026). Kapı, /krediler ve kabuk buradan okur.
 * Okuma düşerse sayaçlar boş görünür; asıl sınırı SQL koyar (credit_reserve_metered).
 */
export async function loadFreeMeters(
  service: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<FreeMeterView[]> {
  const keys = VISIBLE_FREE_METERS.map((meter) => ({ meter, key: freePeriodKey(meter, now) }));
  let rows: { meter: string; period_key: string; used: number }[] = [];
  try {
    const { data, error } = await service
      .from("free_usage")
      .select("meter, period_key, used")
      .eq("user_id", userId)
      .in("period_key", [...new Set(keys.map((item) => item.key))]);
    if (!error && data) rows = data as typeof rows;
  } catch {
    rows = [];
  }
  return keys.map(({ meter, key }) => {
    const row = rows.find((item) => item.meter === meter && item.period_key === key);
    return {
      meter,
      used: Math.min(FREE_LIMITS[meter], Math.max(0, row?.used ?? 0)),
      limit: FREE_LIMITS[meter],
      resetsAtIso: freeMeterResetsAt(meter, now).toISOString(),
    };
  });
}
