import { ParityMarketingPage } from "@/components/parity/marketing";
import { LandingPage, type LandingPrices } from "@/components/landing/landing-page";
import { createClient } from "@/lib/supabase/server";

/**
 * Ana sayfa (19 Ekim 2026). Fiyatlar veritabanından okunur: `/fiyatlandirma` ve ödeme ekranıyla
 * aynı kaynak, sayfada eski fiyat kalmasın. Okuma düşerse fiyat yerine "—" görünür, sayfa düşmez.
 */
export const revalidate = 300;

async function loadPrices(): Promise<LandingPrices> {
  const empty: LandingPrices = { plusMonthly: null, plusYearly: null, plusWeekly: null };
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plans")
      .select("slug, price_try")
      .eq("active", true)
      .in("slug", ["plus-aylik", "plus-yillik", "plus-haftalik"]);
    const price = (slug: string) => {
      const row = (data ?? []).find((plan) => plan.slug === slug);
      return typeof row?.price_try === "number" ? row.price_try : null;
    };
    return { plusMonthly: price("plus-aylik"), plusYearly: price("plus-yillik"), plusWeekly: price("plus-haftalik") };
  } catch {
    return empty;
  }
}

export default async function HomePage() {
  const prices = await loadPrices();
  return (
    <ParityMarketingPage variant="marketing">
      <LandingPage prices={prices} />
    </ParityMarketingPage>
  );
}
