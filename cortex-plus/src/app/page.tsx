import { ParityMarketingPage } from "@/components/parity/marketing";
import { LandingPage } from "@/components/landing/landing-page";
import { createClient } from "@supabase/supabase-js";
import { loadPlusPrices } from "@/lib/billing/plan-prices";

/**
 * Ana sayfa (19 Ekim 2026). Fiyatlar veritabanından okunur: `/fiyatlandirma` ve ödeme ekranıyla
 * aynı kaynak, sayfada eski fiyat kalmasın. Okuma düşerse fiyat yerine "—" görünür, sayfa düşmez.
 */
export const revalidate = 300;

/**
 * Çerezsiz anonim istemci (2 Kasım 2026, O12): `cookies()` sayfayı her istekte sunucuda çizdiriyordu
 * (`private, no-store`); fiyatlar herkese açık olduğundan sayfa artık 5 dakikalık önbellekten gelir.
 */
function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function HomePage() {
  const prices = await loadPlusPrices(publicClient());
  return (
    <ParityMarketingPage variant="marketing">
      <LandingPage prices={prices} />
    </ParityMarketingPage>
  );
}
