import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatResetAt, quotaView } from "@/lib/credits/period";
import {
  getSubscriptionBadge,
  type SubscriptionBadge,
} from "@/lib/student/subscription-badge";

export type StudentAccountContext = {
  balance: number;
  freeAllowanceRemaining: number;
  isPremium: boolean;
  subscriptionBadge: SubscriptionBadge;
  canSpend: boolean;
  /**
   * "5 Eylül 2026 03:00" — hakkın ne zaman yenileneceği.
   *
   * Yükseltme kapısında gösteriliyor: hakkı dolan öğrenciye yalnızca "abone
   * ol" demek eksik cevap. Beklerse de çözülüyor ve bunu saklamıyoruz.
   */
  resetsAtLabel: string;
  periodKind: "daily" | "monthly";
};

export async function getStudentAccountContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudentAccountContext> {
  const [{ data: wallet }, subscriptionBadge] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    getSubscriptionBadge(supabase, userId),
  ]);

  const isPremium = subscriptionBadge !== null;
  const balance = wallet?.balance ?? 0;
  const freeAllowanceRemaining = wallet?.free_allowance_remaining ?? 0;
  const quota = quotaView(wallet, isPremium);

  return {
    balance,
    freeAllowanceRemaining,
    isPremium,
    subscriptionBadge,
    canSpend: balance > 0 || freeAllowanceRemaining > 0,
    resetsAtLabel: formatResetAt(quota.resetsAt),
    periodKind: quota.kind,
  };
}
