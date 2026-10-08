import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements, type Audience } from "@/lib/billing/entitlements";
import { freePreview, previewAllowanceLeft, previewWallet } from "@/lib/billing/free-preview";
import { allowanceShare, formatResetAt, quotaView, type PeriodKind } from "@/lib/credits/period";
import { type SubscriptionBadge } from "@/lib/student/subscription-badge";
import { isAdminUser } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/server";

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
   * Ücretsiz önizlemede `false`: yönetici ücretsiz hesabın gördüğünü görür.
   */
  isAdmin: boolean;
  /** Yönetici "ücretsiz gibi gör" önizlemesinde (free-preview.ts). */
  freePreview?: boolean;
  /**
   * "5 Eylül 2026 03:00" — hakkın ne zaman yenileneceği.
   *
   * Yükseltme kapısında gösteriliyor: hakkı dolan öğrenciye yalnızca "abone
   * ol" demek eksik cevap. Beklerse de çözülüyor ve bunu saklamıyoruz.
   */
  resetsAtLabel: string;
  /** Aynı an, ISO — yükseltme kapısındaki geri sayım için (Astra gibi). */
  resetsAtIso?: string;
  periodKind: PeriodKind;
  /** Dönem hakkının kullanılan yüzdesi — öğrenciye gösterilen tek sayı. */
  usedPercent: number;
  /** Satın alınmış ek paketin dönem hakkına oranı (%); yoksa null. */
  extraPercent: number | null;
};

export async function getStudentAccountContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudentAccountContext> {
  const [{ data: wallet }, entitlements, isAdmin] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select(
        "balance, free_allowance_remaining, period_allowance, period_ends_at, period_kind",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    getUserEntitlements(supabase, userId),
    isAdminUser(supabase, userId),
  ]);

  // Önizleme tablosu yalnız sunucu anahtarıyla okunur.
  const preview = isAdmin ? await freePreview(createServiceClient(), userId).catch(() => null) : null;
  if (preview) {
    const quota = quotaView(previewWallet(preview), false);
    return {
      audience: "free",
      balance: 0,
      freeAllowanceRemaining: quota.remaining,
      isPremium: false,
      showsUpgradeChrome: true,
      subscriptionBadge: null,
      subscriptionAllowance: null,
      subscriptionPeriodEnd: null,
      canSpend: previewAllowanceLeft(preview) > 0,
      isAdmin: false,
      freePreview: true,
      resetsAtLabel: formatResetAt(quota.resetsAt),
      resetsAtIso: quota.resetsAt.toISOString(),
      periodKind: quota.kind,
      usedPercent: quota.usedPercent,
      extraPercent: null,
    };
  }

  const subscriptionBadge = entitlements.badge;
  const isPremium = entitlements.isPremium;
  const balance = wallet?.balance ?? 0;
  const freeAllowanceRemaining = wallet?.free_allowance_remaining ?? 0;
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
    resetsAtIso: quota.resetsAt.toISOString(),
    periodKind: quota.kind,
    usedPercent: quota.usedPercent,
    extraPercent: allowanceShare(balance, quota.allowance),
  };
}
