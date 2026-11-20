import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo/page-metadata";

/*
  Yapılandırılmış veri (schema.org JSON-LD; 20 Kasım 2026, Faz 3). Yalnız sitede görünen, doğru bilgi: ad, adres,
  açıklama, logo, sayfadaki sık sorulanlar ve sayfanın gezinme yolu. Fiyat, puan, yorum ya da öğrenci sayısı yazılmaz.
*/

type JsonLdObject = { "@context": "https://schema.org"; "@type": string; [key: string]: unknown };

const CONTEXT = "https://schema.org" as const;

/** Ana sayfa: kurum. Logo üst çubuktaki dosyanın kendisi. */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "EducationalOrganization",
    "@id": `${SITE_URL}/#kurum`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: absoluteUrl("/logo-mark-trim.png"),
  };
}

/** Ana sayfa: site. Sitede arama kutusu olmadığı için `SearchAction` yok. */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": `${SITE_URL}/#site`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "tr-TR",
    publisher: { "@id": `${SITE_URL}/#kurum` },
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
