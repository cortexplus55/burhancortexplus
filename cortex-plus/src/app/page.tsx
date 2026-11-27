import { ParityMarketingPage } from "@/components/parity/marketing";
import { LandingPage } from "@/components/landing/landing-page";
import { loadPublicPlanOffers, plusPricesFromOffers } from "@/lib/billing/public-plan-offers";
import { createPublicReadClient } from "@/lib/supabase/public-read";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ } from "@/lib/marketing/landing-content";
import { pageMetadata, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/page-metadata";
import {
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";

/** Kanonik adres ve paylaşım bilgisi (20 Kasım 2026, Faz 3); başlık ve açıklama kök düzenle aynı. */
export const metadata = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: "/", absoluteTitle: true });

/**
 * Ana sayfa (19 Ekim 2026). Fiyatlar veritabanından okunur: `/fiyatlandirma` ve ödeme ekranıyla
 * aynı kaynak, sayfada eski fiyat kalmasın. Okuma düşerse fiyat yerine "—" görünür, sayfa düşmez.
 */
export const revalidate = 300;

export default async function HomePage() {
  // Çerezsiz anonim istemci (2 Kasım 2026, O12): `cookies()` sayfayı her istekte sunucuda çizdiriyordu; fiyatlar herkese
  // açık olduğundan sayfa 5 dakikalık önbellekten gelir. Planlar tek okumadan (27 Kasım 2026, GEO): Plus kartlarının
  // fiyatı ve yapılandırılmış verideki teklif listesi aynı satırlar.
  const offers = await loadPublicPlanOffers(createPublicReadClient());
  const prices = plusPricesFromOffers(offers);
  return (
    <ParityMarketingPage variant="marketing">
      {/* Kurum, site, uygulama (canlı fiyatlı teklifler), sayfa ve sayfadaki sık sorulanlar tek @graph içinde. */}
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(offers),
          webPageJsonLd({ name: SITE_TITLE, description: SITE_DESCRIPTION, path: "/", about: "software" }),
          faqPageJsonLd(
            FAQ.map((item) => ({ question: item.q, answer: item.a })),
            "/",
          ),
        ]}
      />
      <LandingPage prices={prices} />
    </ParityMarketingPage>
  );
}
