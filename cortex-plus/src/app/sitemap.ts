import type { MetadataRoute } from "next";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { curriculumSitemapPaths } from "@/lib/curriculum/seo";
import { COOKIE_POLICY_VERSION, KVKK_TEXT_DATE, LEGAL_VERSIONS } from "@/lib/legal/versions";
import { PUBLIC_PAGES } from "@/lib/seo/public-pages";
import { SITE_URL } from "@/lib/seo/page-metadata";

const base = SITE_URL;

/**
 * Tanıtım ve hukuk sayfaları tek listeden (`public-pages.ts`, `/llms.txt` de onu okur). Yönlenen adresler
 * ("/ogretmenler-ve-profesorler-icin" 29 Ağustos'ta emekli edildi ve /kayit'e yönleniyor; "/kullanim-sartlari" 308 →
 * /kullanim-kosullari) ve robots'un kapattığı giriş / kayıt sayfaları (27 Kasım 2026) haritada yok: Google'a boş yere
 * gezdirilecek ya da "robots.txt tarafından engellendi" diye işaretlenecek bir adres bildirmek demek.
 */
const marketingPaths = PUBLIC_PAGES.filter((page) => page.inMarketingSitemap).map((page) => page.path);

/**
 * Son değişiklik tarihi (26 Kasım 2026, Search Console). Metni sürümlü sayfalar kendi sürüm tarihini, müfredat
 * sayfaları kayıt defterinin veri sürümünü verir; öbür sayfalar yayın (derleme) anını. Tarihler gün olarak yazılır
 * (İstanbul öğleni: gün UTC'de kaymaz).
 */
const PAGE_DATES: Record<string, string> = {
  "/kvkk": KVKK_TEXT_DATE,
  "/kullanim-kosullari": LEGAL_VERSIONS.kullanim_kosullari,
  "/cerez-politikasi": COOKIE_POLICY_VERSION,
};

function dayOf(value: string | undefined): Date | null {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(value ?? "")?.[0];
  return day ? new Date(`${day}T12:00:00+03:00`) : null;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const marketing = marketingPaths.map((path) => ({
    url: `${base}${path}`,
    lastModified: dayOf(PAGE_DATES[path]) ?? now,
    changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "" ? 1 : 0.7,
  }));
  // Paket 6: resmî müfredat program/ünite/kazanım sayfaları (kayıt defterinden, ~5.200 adres; sınır 50.000).
  const curriculumDate = dayOf(CURRICULUM.version) ?? now;
  const curriculum = curriculumSitemapPaths().map((path) => ({
    url: `${base}${path}`,
    lastModified: curriculumDate,
    changeFrequency: "monthly" as const,
    priority: path.split("/").length <= 3 ? 0.6 : 0.4,
  }));
  return [...marketing, ...curriculum];
}
