import Link from "next/link";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { PricingAdvantageStrip } from "@/components/marketing/advantage-sections";
import { AnswerFaqSection } from "@/components/marketing/answer-faq-section";
import { SubscriptionCards } from "@/components/parity/subscription-cards";
import { createClient } from "@/lib/supabase/server";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { FREE_FIRST_LESSON_SENTENCE, PLUS_ONLY_SENTENCE } from "@/lib/billing/free-tier-copy";
import { storeOffersFromPlans } from "@/lib/billing/store-products";
import { PRICING_FAQ } from "@/lib/marketing/answer-faq";
import { PRODUCT_SUMMARY } from "@/lib/marketing/product-definition";
import { pageMetadata } from "@/lib/seo/page-metadata";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/json-ld";
import "@/styles/landing.css";

/** 11 Kasım 2026: ücretsizde ilk dersin döngüsü açık, Plus'a özel olanlar adıyla (tek kaynak `free-tier-copy.ts`). */
const PRICING_DESCRIPTION = `${FREE_FIRST_LESSON_SENTENCE} ${PLUS_ONLY_SENTENCE} Plus ayrıca bütün konuları ve geniş aylık hakkı açar; Sigma en yüksek hakkı verir.`;

// Kanonik adres ve sayfaya özel paylaşım bilgisi (20 Kasım 2026, Faz 3).
export const metadata = pageMetadata({
  title: "Fiyatlandırma",
  description: PRICING_DESCRIPTION,
  path: "/fiyatlandirma",
});

export const dynamic = "force-dynamic";

export default async function FiyatlandirmaPage() {
  let plans: {
    id: string;
    slug?: string | null;
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
        "id, slug, name, description, price_try, credit_amount, is_premium, billing_period, tier, period_days",
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
  // Yapılandırılmış verideki teklifler kartlarla aynı satırlardan (27 Kasım 2026, GEO): fiyat sabit yazılmaz.
  const offers = storeOffersFromPlans(plans);

  return (
    <ParityMarketingPage
      title="Fiyatlandırma"
      description={PRODUCT_SUMMARY}
    >
      {/*
        Kurum, site, uygulama (kartlardaki fiyatlarla), sayfa, gezinme yolu ve sayfadaki sık sorulanlar tek @graph içinde
        (27 Kasım 2026, GEO). Fiyat her istekte veritabanından; okunamayan plan teklif listesine girmez.
      */}
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareApplicationJsonLd(offers),
          webPageJsonLd({
            name: "Fiyatlandırma",
            description: PRICING_DESCRIPTION,
            path: "/fiyatlandirma",
            breadcrumb: true,
            about: "software",
          }),
          breadcrumbJsonLd([
            { name: "Cortex Plus", path: "/" },
            { name: "Fiyatlandırma", path: "/fiyatlandirma" },
          ]),
          faqPageJsonLd(
            PRICING_FAQ.map((item) => ({ question: item.q, answer: item.a })),
            "/fiyatlandirma",
          ),
        ]}
      />
      <div data-cinematic-reveal className="space-y-4">
        {!checkoutEnabled ? (
          <p className="mx-auto max-w-lg rounded-2xl border border-[var(--mk-border)] bg-[var(--mk-surface)] px-4 py-3 text-center text-sm text-[var(--mk-muted)]">
            Ödeme altyapısı henüz canlı değil. Paketleri inceleyebilirsin; satın alma
            yakında açılacak.
          </p>
        ) : null}
        {plans.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-[var(--mk-border)] bg-[color:color-mix(in_srgb,var(--mk-surface)_60%,transparent)] px-6 py-12 text-center">
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
      <PricingAdvantageStrip />
      {/* "Cevap önce" sık sorulanlar (27 Kasım 2026, GEO): ana sayfanın SSS görünümü, kabuğun zemininde. */}
      <div className="lp lp--embed">
        <AnswerFaqSection id="fiyat-faq" title="Sık sorulanlar" items={PRICING_FAQ} />
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
