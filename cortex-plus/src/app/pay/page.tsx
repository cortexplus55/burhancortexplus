import { AppShell } from "@/components/layout/app-shell";
import { SubscriptionCards } from "@/components/parity/subscription-cards";
import { PromoRedeem } from "@/components/billing/promo-redeem";
import { requireUser } from "@/lib/auth/session";
import { getSubscriptionBadge } from "@/lib/student/subscription-badge";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { PlusMonth } from "@/components/marketing/plus-month";
import { loadPlusPrices } from "@/lib/billing/plan-prices";

export const metadata = { title: "Abonelik" };

/** Referans ürün `/pay` — uygulama içi Plus satın alma (checkout altyapısı /paketler ile aynı). */
export default async function PayPage({ searchParams }: { searchParams: Promise<{ kod?: string | string[] }> }) {
  const { supabase, user } = await requireUser();
  // Beta kodu bağlantısı (/pay?kod=BETA-…): kutu dolu açılır, öğrenci "Kodu kullan"a basar.
  const kodParam = (await searchParams).kod;
  const initialCode = (Array.isArray(kodParam) ? kodParam[0] : kodParam)?.slice(0, 40) ?? "";

  const [extendedPlans, currentBadge, entitlements, prices] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, name, description, price_try, credit_amount, is_premium, billing_period, tier, period_days",
      )
      .eq("active", true)
      .order("sort_order"),
    getSubscriptionBadge(supabase, user.id),
    getUserEntitlements(supabase, user.id),
    loadPlusPrices(supabase),
  ]);

  let plans = extendedPlans.data;
  if (extendedPlans.error) {
    const { data: legacyPlans } = await supabase
      .from("plans")
      .select("id, name, description, price_try, credit_amount, is_premium")
      .eq("active", true)
      .order("sort_order");
    plans = (legacyPlans ?? []).map((plan) => ({
      ...plan,
      billing_period: null,
      tier: null,
      period_days: null,
    }));
  }

  return (
    <AppShell>
      <div id="planlar">
        <SubscriptionCards
          plans={plans ?? []}
          embedded
          headingLevel="h1"
          currentBadge={currentBadge}
          currentAllowance={entitlements.monthlyAllowance}
          checkoutEnabled={isPaytrConfigured()}
        />
      </div>
      <PromoRedeem initialCode={initialCode} />
      {/* Ücretsiz öğrenciye planların altında Plus'ın bir ayı ve "ayını kur" (20 Ekim 2026). */}
      {entitlements.showsUpgradeChrome ? (
        <PlusMonth
          variant="full"
          headingLevel="h2"
          monthlyKurus={prices.plusMonthly}
          primary={{ label: "Plus'ı seç", href: "#planlar" }}
        />
      ) : null}
    </AppShell>
  );
}
