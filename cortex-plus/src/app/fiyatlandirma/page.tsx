import Link from "next/link";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { SubscriptionCards } from "@/components/parity/subscription-cards";
import { createClient } from "@/lib/supabase/server";
import { isPaytrConfigured } from "@/lib/payments/paytr";

export const metadata = {
  title: "Fiyatlandırma",
  description:
    "Ücretsiz plandaki her şey ve: Plus yüksek aylık kota ekler; Sigma gelişmiş modeli de katar.",
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

  const checkoutEnabled = isPaytrConfigured();

  return (
    <ParityMarketingPage
      title="Fiyatlandırma"
      description="Ücretsiz plandaki her şey ve: Plus yüksek aylık kota ekler; Sigma gelişmiş modeli de katar."
    >
      <div data-cinematic-reveal className="space-y-4">
        {!checkoutEnabled ? (
          <p className="mx-auto max-w-lg rounded-2xl border border-[var(--mk-border)] bg-[var(--mk-surface)] px-4 py-3 text-center text-sm text-[var(--mk-muted)]">
            Ödeme altyapısı henüz canlı değil. Paketleri inceleyebilirsin; satın alma
            yakında açılacak.
          </p>
        ) : null}
        {plans.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-[var(--mk-border)] bg-[var(--mk-surface)]/60 px-6 py-12 text-center">
            <p className="text-base font-medium text-[var(--mk-text)]">
              Paketler şu an listelenemiyor
            </p>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">
              Biraz sonra yeniden dene. Sorun sürerse destek hattından yazman yeterli.
            </p>
            <Link
              href="/iletisim"
              className="mt-5 inline-flex text-sm font-medium text-[var(--mk-primary)] underline underline-offset-4"
            >
              Destekle konuş
            </Link>
          </div>
        ) : (
          <SubscriptionCards
            plans={plans}
            guestMode
            checkoutEnabled={checkoutEnabled}
          />
        )}
      </div>
      <p className="pb-8 text-center text-sm text-[var(--mk-muted)]">
        Zaten hesabın var mı?{" "}
        <Link href="/giris" className="text-[var(--mk-primary)] underline">
          Giriş yap
        </Link>
      </p>
    </ParityMarketingPage>
  );
}
