import { sellerField } from "@/lib/legal/seller";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/page-metadata";

/*
  Yapılandırılmış veri (schema.org JSON-LD; 20 Kasım 2026, Faz 3). Yalnız sitede görünen, doğru bilgi: ad, adres,
  açıklama, logo, sayfadaki sık sorulanlar ve sayfanın gezinme yolu. Fiyat, puan, yorum ya da öğrenci sayısı yazılmaz:
  fiyat veritabanından değişir (yapılandırılmış veride eski fiyat kalırdı), puan ve yorum elimizde yok.

  26 Kasım 2026 (Search Console): `SoftwareApplication` bilerek yok. Google bu türü ancak puan (`aggregateRating`) ya da
  yorum (`review`) ile geçerli sayar; ikisi de olmadan Search Console "geçersiz öğe" yazar ve uydurma puan yazılmaz.
  Ürünü ana sayfadaki `Organization` + `WebSite` anlatır.
*/

type JsonLdObject = { "@context": "https://schema.org"; "@type": string; [key: string]: unknown };

const CONTEXT = "https://schema.org" as const;
const ORGANIZATION_ID = `${SITE_URL}/#kurum`;
const WEBSITE_ID = `${SITE_URL}/#site`;

/** Ana sayfa: kurum (marka). Logo üst çubuktaki dosyanın kendisi; iletişim adresi hukuki sayfalardakiyle aynı. */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
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
  };
}

/**
 * Tek sayfa: sayfanın kendisi (ad, açıklama, adres) ve siteye bağı. Liste sayfası `CollectionPage`, içindeki
 * bağlantılar `mainEntity` olarak (`itemListJsonLd`).
 */
export function webPageJsonLd(input: {
  type?: "WebPage" | "CollectionPage";
  name: string;
  description: string;
  path: string;
  mainEntity?: object;
}): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": input.type ?? "WebPage",
    "@id": `${absoluteUrl(input.path)}#sayfa`,
    url: absoluteUrl(input.path),
    name: input.name,
    description: input.description,
    inLanguage: "tr-TR",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
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

/** Ana sayfa: site. Sitede arama kutusu olmadığı için `SearchAction` yok. */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "tr-TR",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** Sayfada açılıp kapanan sık sorulanlar; soru ve cevap sayfadaki metnin aynısı. */
export function faqPageJsonLd(items: ReadonlyArray<{ question: string; answer: string }>): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Gezinme yolu: her adım sayfada bağlantısı olan bir sayfa (ad, sayfanın kendi başlığı). */
export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
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
