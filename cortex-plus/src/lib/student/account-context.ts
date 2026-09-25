import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements, type Audience } from "@/lib/billing/entitlements";
import { formatResetAt, quotaView, type PeriodKind } from "@/lib/credits/period";
import { type SubscriptionBadge } from "@/lib/student/subscription-badge";

export type StudentAccountContext = {
  audience: Audience;
  balance: number;
  freeAllowanceRemaining: number;
  isPremium: boolean;
  /** Ücretsize özel Satın al / bant / sohbet kartı. */
  showsUpgradeChrome: boolean;
  subscriptionBadge: SubscriptionBadge;
  subscriptionAllowance: number | null;
  subscriptionPeriodEnd: string | null;
  canSpend: boolean;
  /**
   * `user_roles` içinde iptal edilmemiş `admin` satırı.
   * İstemciden gelmez; sunucu okur. Kredi engeli ve satın alma uyarıları buna bakar.
   */
  isAdmin: boolean;
  /**
   * "5 Eylül 2026 03:00" — hakkın ne zaman yenileneceği.
   *
   * Yükseltme kapısında gösteriliyor: hakkı dolan öğrenciye yalnızca "abone
   * ol" demek eksik cevap. Beklerse de çözülüyor ve bunu saklamıyoruz.
   */
  resetsAtLabel: string;
  periodKind: PeriodKind;
};

export async function getStudentAccountContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudentAccountContext> {
  const [{ data: wallet }, entitlements, adminRole] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    getUserEntitlements(supabase, userId),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  const subscriptionBadge = entitlements.badge;
  const isPremium = entitlements.isPremium;
  const balance = wallet?.balance ?? 0;
  const freeAllowanceRemaining = wallet?.free_allowance_remaining ?? 0;
  // Sorgu hata verirse yönetici sayma: kredi muafiyeti kapalı kalsın.
  const isAdmin = !adminRole.error && Boolean(adminRole.data);
  const quota = quotaView(
    wallet,
    isPremium,
    new Date(),
    entitlements.monthlyAllowance ?? undefined,
  );

  return {
    audience: entitlements.audience,
    balance,
    freeAllowanceRemaining,
    isPremium,
    showsUpgradeChrome: !isAdmin && entitlements.showsUpgradeChrome,
    subscriptionBadge,
    subscriptionAllowance: entitlements.monthlyAllowance,
    subscriptionPeriodEnd: entitlements.subscriptionPeriodEnd,
    canSpend: isAdmin || balance > 0 || freeAllowanceRemaining > 0,
    isAdmin,
    resetsAtLabel: formatResetAt(quota.resetsAt),
    periodKind: quota.kind,
  };
}
