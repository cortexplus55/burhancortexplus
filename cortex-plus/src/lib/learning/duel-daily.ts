import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { duelDailyLimit } from "@/lib/entitlements/config";

export type DuelDailyCheck = { allowed: boolean; limit: number | null; used: number };

/** İstanbul gününün başı (sabit UTC+3). */
export function istanbulDayStartIso(now: Date = new Date()): string {
  return `${istanbulDay(now)}T00:00:00+03:00`;
}

/**
 * Günlük düello kurma sınırı (15 Kasım 2026, Burhan onayı, düello 9B): ücretsiz 1, Plus / Sınav Haftası 10, Sigma 30,
 * kurucu sınırsız. Sayım bugün (İstanbul günü) kurulan düellolardan; oynamak, bot ve rövanş sayılmaz. Okuma düşerse
 * engellemez (kredi ve hız sınırı yine çalışır).
 */
export async function checkDuelDailyLimit(
  service: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DuelDailyCheck> {
  try {
    const [entitlements, founder] = await Promise.all([getUserEntitlements(service, userId), billingExempt(service, userId)]);
    const limit = duelDailyLimit(entitlements.plan, founder);
    if (limit == null) return { allowed: true, limit: null, used: 0 };
    const { count, error } = await service
      .from("prep_duels")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", userId)
      .gte("created_at", istanbulDayStartIso(now));
    if (error) return { allowed: true, limit, used: 0 };
    const used = count ?? 0;
    return { allowed: used < limit, limit, used };
  } catch {
    return { allowed: true, limit: null, used: 0 };
  }
}
