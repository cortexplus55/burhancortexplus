import { AppShell } from "@/components/layout/app-shell";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-pay.css";
import { SubscriptionCards } from "@/components/parity/subscription-cards";
import { PromoRedeem } from "@/components/billing/promo-redeem";
import { requireUser } from "@/lib/auth/session";
import { getSubscriptionBadge } from "@/lib/student/subscription-badge";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { PlusMonth } from "@/components/marketing/plus-month";
import { loadPlusPrices } from "@/lib/billing/plan-prices";
import Link from "next/link";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { FounderBadge } from "@/components/student/founder-chip";
import { headers } from "next/headers";
import { nativePlatformFromUserAgent } from "@/lib/platform/native-ua";
import { NativeSubscriptionScreen } from "@/components/billing/native-subscription-screen";
import { STORE_PRODUCTS, storeOffersFromPlans } from "@/lib/billing/store-products";

export const metadata = { title: "Abonelik" };

/** Referans ürün `/pay` — uygulama içi Plus satın alma (checkout altyapısı /paketler ile aynı). */
export default async function PayPage({ searchParams }: { searchParams: Promise<{ kod?: string | string[] }> }) {
  const { supabase, user } = await requireUser();
  // Mobil uygulamada (26 Kasım 2026, App Store 3.1.1 / Google Play): yalnız mağaza aboneliği. PayTR, veli ödeme
  // bağlantısı, kampanya kodu ve "Plus'ın bir ayı" satışı uygulamada çizilmez.
  const nativePlatform = nativePlatformFromUserAgent((await headers()).get("user-agent"));
  if (nativePlatform) {
    const [planRows, entitlements, account] = await Promise.all([
      supabase.from("plans").select("slug, price_try, description, active").in(
        "slug",
        STORE_PRODUCTS.map((product) => product.slug),
      ),
      getUserEntitlements(supabase, user.id),
      getStudentAccountContext(supabase, user.id).catch(() => null),
    ]);
    return (
      <AppShell focus>
        <NativeSubscriptionScreen
          platform={nativePlatform}
          offers={storeOffersFromPlans(planRows.data)}
          currentPlan={entitlements.isPremium ? (entitlements.badge ?? entitlements.planName ?? "Plus") : null}
          founder={account?.isAdmin === true}
        />
      </AppShell>
    );
  }
  // Beta kodu bağlantısı (/pay?kod=BETA-…): kutu dolu açılır, öğrenci "Kodu kullan"a basar.
  const kodParam = (await searchParams).kod;
  const initialCode = (Array.isArray(kodParam) ? kodParam[0] : kodParam)?.slice(0, 40) ?? "";

  const [extendedPlans, currentBadge, entitlements, prices, account, payV2] = await Promise.all([
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
    getStudentAccountContext(supabase, user.id).catch(() => null),
    uiV2("pay", user.id),
  ]);
  // Kurucu hesabı (8 Kasım 2026): bütün özellikler açık; "Plus'a yükselt" satışı yerine hesabın durumu.
  const founder = account?.isAdmin === true;

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
    <AppShell focus>
      <UiScope keys={payV2 ? ["pay"] : []}>
      {founder ? (
        <section className="cp-pay-founder" aria-label="Hesabının durumu">
          <FounderBadge />
          <h1>Bütün özellikler açık</h1>
          <p>Kurucu hesabında ödeme gerekmez ve işlemler haktan düşmez. Aşağıdaki planlar öğrencinin gördüğü hâliyle duruyor.</p>
          <Link href="/krediler" className="cp-pay-founder-link">
            Kullanım limitleri
          </Link>
        </section>
      ) : null}
      <div id="planlar">
        <SubscriptionCards
          plans={plans ?? []}
          embedded
          headingLevel={founder ? "h2" : "h1"}
          currentBadge={currentBadge}
          currentAllowance={entitlements.monthlyAllowance}
          checkoutEnabled={isPaytrConfigured()}
        />
      </div>
      <PromoRedeem initialCode={initialCode} />
      {/* Ücretsiz öğrenciye planların altında Plus'ın bir ayı ve "ayını kur" (20 Ekim 2026). */}
      {entitlements.showsUpgradeChrome && !founder ? (
        <PlusMonth
          variant="full"
          headingLevel="h2"
          monthlyKurus={prices.plusMonthly}
          primary={{ label: "Plus'ı seç", href: "#planlar" }}
        />
      ) : null}
      </UiScope>
    </AppShell>
  );
}
