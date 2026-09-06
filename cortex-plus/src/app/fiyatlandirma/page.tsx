import Link from "next/link";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { createClient } from "@/lib/supabase/server";
import { isPaytrConfigured } from "@/lib/payments/paytr";

export const metadata = {
  title: "Fiyatlandırma",
  description: "Cortex Plus paketleri.",
};

export const dynamic = "force-dynamic";

export default async function FiyatlandirmaPage() {
  let plans: {
    id: string;
    name: string;
    description: string | null;
    price_try: number;
    credit_amount: number;
    is_premium: boolean;
    billing_period: string | null;
    tier: string | null;
    period_days: number | null;
  }[] = [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select(
        "id, name, description, price_try, credit_amount, is_premium, billing_period, tier, period_days",
      )
      .eq("active", true)
      .order("sort_order");
    if (!error) {
      plans = data ?? [];
    } else {
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
  } catch {
    plans = [];
  }

  return (
    <AstraMarketingPage
      title="Fiyatlandırma"
      description="İhtiyacına uygun kullanım hakkını seç."
    >
      <div data-cinematic-reveal>
        <AstraSubscriptionCards
          plans={plans}
          guestMode
          checkoutEnabled={isPaytrConfigured()}
        />
      </div>
      <p className="pb-8 text-center text-sm text-[var(--mk-muted)]">
        Zaten hesabın var mı?{" "}
        <Link href="/giris" className="text-[var(--mk-primary)] underline">
          Giriş yap
        </Link>
      </p>
    </AstraMarketingPage>
  );
}
