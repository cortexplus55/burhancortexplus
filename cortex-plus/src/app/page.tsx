import { ParityMarketingPage } from "@/components/parity/marketing";
import { LandingPage } from "@/components/landing/landing-page";
import { createClient } from "@/lib/supabase/server";
import { loadPlusPrices } from "@/lib/billing/plan-prices";

/**
 * Ana sayfa (19 Ekim 2026). Fiyatlar veritabanından okunur: `/fiyatlandirma` ve ödeme ekranıyla
 * aynı kaynak, sayfada eski fiyat kalmasın. Okuma düşerse fiyat yerine "—" görünür, sayfa düşmez.
 */
export const revalidate = 300;

export default async function HomePage() {
  const prices = await loadPlusPrices(await createClient());
  return (
    <ParityMarketingPage variant="marketing">
      <LandingPage prices={prices} />
    </ParityMarketingPage>
  );
}
