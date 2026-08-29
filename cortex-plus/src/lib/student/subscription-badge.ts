import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionBadge = "Plus" | "Sigma" | null;

export async function getSubscriptionBadge(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionBadge> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plans(name, is_premium)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.plans) return null;

  const plan = data.plans as { name?: string; is_premium?: boolean };
  const name = (plan.name ?? "").toLowerCase();
  if (name.includes("sigma")) return "Sigma";
  if (plan.is_premium) return "Plus";
  return null;
}
