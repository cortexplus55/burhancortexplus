import { FREE_TIER_SENTENCE } from "@/lib/billing/free-meters";
import type { PublicPlanOffer } from "@/lib/billing/public-plan-offers";
import { sellerField } from "@/lib/legal/seller";
import { PRODUCT_SUMMARY } from "@/lib/marketing/product-definition";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/page-metadata";

/*
  Yapılandırılmış veri (schema.org JSON-LD; 20 Kasım 2026, Faz 3). Yalnız sitede görünen, doğru bilgi: ad, adres,
  açıklama, logo, sayfadaki sık sorulanlar ve sayfanın gezinme yolu. Puan, yorum ya da öğrenci sayısı yazılmaz: elimizde
  yok, uydurulmaz.

  27 Kasım 2026 (GEO, ürün sahibinin isteği): her sayfanın verisi tek bir `@graph` içinde (`JsonLd` sarar), düğümler
  birbirine `@id` ile bağlı: kurum (`#kurum`), site (`#site`), uygulama (`#uygulama`), sayfa (`<adres>#sayfa`), sık
  sorulanlar (`<adres>#sss`), gezinme yolu (`<adres>#yol`).

  `SoftwareApplication` (aynı gün, ürün sahibinin isteği; 26 Kasım'daki "bilerek yok" kararı değişti): fiyatlar her
  istekte veritabanından (`loadPublicPlanOffers`), sabit fiyat yazılmaz. Puan ve yorum olmadığı için Google bu öğeyi
  "Yazılım uygulamaları" zengin sonucu için geçersiz sayabilir (Search Console o raporda "aggregateRating ya da review
  eksik" yazar); dizine eklemeyi etkilemez. Uydurma puan yazılmaz.
*/

export type JsonLdNode = { "@type": string; [key: string]: unknown };

const CONTEXT = "https://schema.org" as const;
export const ORGANIZATION_ID = `${SITE_URL}/#kurum`;
export const WEBSITE_ID = `${SITE_URL}/#site`;
export const SOFTWARE_ID = `${SITE_URL}/#uygulama`;
const PRICING_URL = absoluteUrl("/fiyatlandirma");

/**
 * Kurumun sosyal profilleri (isteğe bağlı): `SOCIAL_PROFILE_URLS` ortam değişkeni, virgül ya da boşlukla ayrılmış https
 * adresleri. Boşsa `sameAs` yazılmaz; uydurma profil yok.
 */
export function socialProfileUrls(raw = process.env.SOCIAL_PROFILE_URLS): string[] {
  const urls = (raw ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && Boolean(url.hostname);
      } catch {
        return false;
      }
    });
  return [...new Set(urls)];
}

/** Kurum (marka). Logo üst çubuktaki dosyanın kendisi; iletişim adresi hukuki sayfalardakiyle aynı. */
export function organizationJsonLd(): JsonLdNode {
  const sameAs = socialProfileUrls();
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: absoluteUrl("/logo-mark-trim.png"),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: sellerField("email"),
        availableLanguage: ["tr"],
      },
    ],
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** Site. Sitede arama kutusu olmadığı için `SearchAction` yok. */
export function websiteJsonLd(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "tr-TR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** Kuruşu schema.org fiyatına çevirir (kuruş 12345 → "123.45"). */
function offerPrice(kurus: number): string {
  return (Math.round(kurus) / 100).toFixed(2);
}

/**
 * Uygulama: ücretsiz hesap ve canlı fiyatlı abonelik planları. Fiyat okunamayan plan listeye girmez
 * (`storeOffersFromPlans`); o durumda yalnız ücretsiz hesap kalır.
 */
export function softwareApplicationJsonLd(plans: readonly PublicPlanOffer[]): JsonLdNode {
  const free = {
    "@type": "Offer",
    name: "Ücretsiz",
    price: "0",
    priceCurrency: "TRY",
    url: PRICING_URL,
    description: `${FREE_TIER_SENTENCE}.`,
  };
  const paid = plans.map((plan) => {
    const price = offerPrice(plan.priceKurus);
    return {
      "@type": "Offer",
      name: plan.label,
      price,
      priceCurrency: "TRY",
      url: PRICING_URL,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "TRY",
        referenceQuantity: { "@type": "QuantitativeValue", value: plan.periodDays, unitCode: "DAY" },
      },
    };
  });
  return {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: PRODUCT_SUMMARY,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web, iOS, Android",
    inLanguage: "tr-TR",
    publisher: { "@id": ORGANIZATION_ID },
    offers: [free, ...paid],
  };
}

/**
 * Tek sayfa: sayfanın kendisi (ad, açıklama, adres) ve siteye bağı. Liste sayfası `CollectionPage`, içindeki
 * bağlantılar `mainEntity` olarak (`itemListJsonLd`). Sayfanın gezinme yolu varsa `breadcrumb` ile bağlanır.
 */
export function webPageJsonLd(input: {
  type?: "WebPage" | "CollectionPage";
  name: string;
  description: string;
  path: string;
  mainEntity?: object;
  breadcrumb?: boolean;
  about?: "software";
}): JsonLdNode {
  const url = absoluteUrl(input.path);
  return {
    "@type": input.type ?? "WebPage",
    "@id": `${url}#sayfa`,
    url,
    name: input.name,
    description: input.description,
    inLanguage: "tr-TR",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(input.about === "software" ? { about: { "@id": SOFTWARE_ID } } : {}),
    ...(input.breadcrumb ? { breadcrumb: { "@id": `${url}#yol` } } : {}),
    ...(input.mainEntity ? { mainEntity: input.mainEntity } : {}),
  };
}

/** Sayfadaki bağlantı listesi (ad ve tam adres, sayfadaki sırayla). */
export function itemListJsonLd(items: ReadonlyArray<{ name: string; path: string }>): Record<string, unknown> {
  return {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

/** Sayfada açılıp kapanan sık sorulanlar; soru ve cevap sayfadaki metnin aynısı. `path` verilirse düğüm adreslenir. */
export function faqPageJsonLd(
  items: ReadonlyArray<{ question: string; answer: string }>,
  path?: string,
): JsonLdNode {
  return {
    "@type": "FAQPage",
    ...(path !== undefined ? { "@id": `${absoluteUrl(path)}#sss`, url: absoluteUrl(path), inLanguage: "tr-TR" } : {}),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Gezinme yolu: her adım sayfada bağlantısı olan bir sayfa (ad, sayfanın kendi başlığı). Düğüm son adımın adresinde. */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>): JsonLdNode {
  const last = items[items.length - 1];
  return {
    "@type": "BreadcrumbList",
    ...(last ? { "@id": `${absoluteUrl(last.path)}#yol` } : {}),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * Bir sayfanın bütün düğümleri tek `@graph` içinde (`@context` bir kez, kökte). Düğümde kalmış `@context` atılır.
 */
export function jsonLdGraph(nodes: ReadonlyArray<object>): { "@context": typeof CONTEXT; "@graph": object[] } {
  return {
    "@context": CONTEXT,
    "@graph": nodes.map((node) => {
      const copy = { ...(node as Record<string, unknown>) };
      delete copy["@context"];
      return copy;
    }),
  };
}

/** JSON'da geçerli ama JavaScript betiğinde satır sonu sayılan iki karakter (kaynakta görünmesin diye kod noktasıyla). */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * `<script type="application/ld+json">` içine güvenli metin. JSON.stringify yalnız veri üretir; `<`, `>`, `&` ve
 * satır ayırıcıları kaçışlanır: veri içinde "</script>" geçse bile betik etiketi erken kapanmaz.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}
