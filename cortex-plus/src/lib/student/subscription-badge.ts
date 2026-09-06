import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionBadge = "Plus" | "Sigma" | null;

export type SubscriptionEntitlement = {
  badge: Exclude<SubscriptionBadge, null>;
  monthlyAllowance: number | null;
};

export async function getSubscriptionEntitlement(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionEntitlement | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, plans(name, is_premium, monthly_allowance)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.plans) return null;
  if (data.current_period_end) {
    const end = new Date(data.current_period_end);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= Date.now()) return null;
  }

  const plan = data.plans as {
    name?: string;
    is_premium?: boolean;
    monthly_allowance?: number | null;
  };
  const name = (plan.name ?? "").toLowerCase();
  const badge = name.includes("sigma")
    ? "Sigma"
    : plan.is_premium
      ? "Plus"
      : null;
  if (badge) {
    return {
      badge,
      monthlyAllowance: plan.monthly_allowance ?? null,
    };
  }
  return null;
}

export async function getSubscriptionBadge(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionBadge> {
  return (await getSubscriptionEntitlement(supabase, userId))?.badge ?? null;
}
