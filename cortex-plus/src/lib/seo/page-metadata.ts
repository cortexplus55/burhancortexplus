import type { Metadata } from "next";

/*
  Sayfa başına arama motoru ve paylaşım bilgisi (20 Kasım 2026, Faz 3). Kök düzenin `openGraph.url`'i her sayfada
  ana sayfayı gösteriyordu ve kamu sayfalarının çoğunda kanonik adres yoktu. Next.js bir sayfa `openGraph` verince
  kökünkini bütünüyle değiştirir (görsel dahil); bu yüzden görsel de burada yazılır.
*/

export const SITE_URL = "https://cortexplus.app";
export const SITE_NAME = "Cortex Plus";
// 19 Ekim 2026: başlık ürünün ne yaptığını söyler (arama sonucunda ve sekmede görünen ilk satır).
export const SITE_TITLE = "Cortex Plus — Ders notundan sınav hazırlığı";
export const SITE_DESCRIPTION =
  "Ders notunu yükle; ders, podcast, test ve sözlü pratik senin notundan hazırlansın. Sınav hazırlığı için AI öğretmen — cortexplus.app";

/** Kökteki paylaşım görselleri (`app/opengraph-image.png`, `app/twitter-image.png`; 1200×630). */
export const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: SITE_TITLE };
export const TWITTER_IMAGE = "/twitter-image.png";

/** "/" → kök adres; "/ozellikler" → tam adres. Sorgu ve parça atılır. */
export function absoluteUrl(path: string): string {
  const clean = (path.split(/[?#]/)[0] ?? "").trim();
  if (!clean || clean === "/") return SITE_URL;
  return `${SITE_URL}${clean.startsWith("/") ? clean : `/${clean}`}`.replace(/\/+$/, "");
}

export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  robots,
}: {
  title: string;
  description: string;
  /** Sayfanın kendi yolu ("/ozellikler"); kanonik ve paylaşım adresi buradan. */
  path: string;
  /** Ana sayfa: başlığa " | Cortex Plus" eklenmez. */
  absoluteTitle?: boolean;
  robots?: Metadata["robots"];
}): Metadata {
  const url = absoluteUrl(path);
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      url,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [TWITTER_IMAGE],
    },
    ...(robots ? { robots } : {}),
  };
}
