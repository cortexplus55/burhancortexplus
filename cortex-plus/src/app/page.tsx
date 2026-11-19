import { ParityMarketingPage } from "@/components/parity/marketing";
import { LandingPage } from "@/components/landing/landing-page";
import { createClient } from "@supabase/supabase-js";
import { loadPlusPrices } from "@/lib/billing/plan-prices";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ } from "@/lib/marketing/landing-content";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/page-metadata";
import { faqPageJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/structured-data";

/** Kanonik adres ve paylaşım bilgisi (20 Kasım 2026, Faz 3); başlık ve açıklama kök düzenle aynı. */
export const metadata = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/", absoluteTitle: true });

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
      {/* Kurum, site ve sayfadaki sık sorulanlar (soru ve cevap sayfadaki metnin aynısı). */}
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          faqPageJsonLd(FAQ.map((item) => ({ question: item.q, answer: item.a }))),
        ]}
      />
      <LandingPage prices={prices} />
    </ParityMarketingPage>
  );
}
