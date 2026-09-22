import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getUserEntitlements,
  type PlanTier as EntitlementPlanTier,
} from "@/lib/billing/entitlements";

export type SubscriptionBadge = "Plus" | "Sigma" | null;

export type SubscriptionEntitlement = {
  badge: Exclude<SubscriptionBadge, null>;
  monthlyAllowance: number | null;
  plan: EntitlementPlanTier;
};

export async function getSubscriptionEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionEntitlement | null> {
  const entitlements = await getUserEntitlements(supabase, userId);
  if (!entitlements.badge) return null;
  return {
    badge: entitlements.badge,
    monthlyAllowance: entitlements.monthlyAllowance,
    plan: entitlements.plan,
  };
}

export async function getSubscriptionBadge(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionBadge> {
  return (await getSubscriptionEntitlement(supabase, userId))?.badge ?? null;
}
