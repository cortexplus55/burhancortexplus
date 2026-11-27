import type { MetadataRoute } from "next";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { curriculumSitemapPaths } from "@/lib/curriculum/seo";
import { COOKIE_POLICY_VERSION, KVKK_TEXT_DATE, LEGAL_VERSIONS } from "@/lib/legal/versions";
import { SITE_URL } from "@/lib/seo/page-metadata";

const base = SITE_URL;

const marketingPaths = [
  "",
  "/sinav-hazirligi",
  "/ozellikler",
  "/fiyatlandirma",
  "/yardim",
  // 20 Kasım 2026 (Faz 3): giriş istemeyen örnek çalışma ve resmî takvim / sınav yapıları sayfası.
  "/ornek",
  "/resmi",
  "/mobil-uygulama",
  // "/ogretmenler-ve-profesorler-icin" bilerek yok: o sayfa 29 Ağustos'ta
  // emekli edildi ve artık /kayit'e yönlendiriyor. Yönlendirmeye düşen bir
  // adresi site haritasına koymak, Google'a boş yere gezdirilecek bir adres
  // bildirmek demek. Aynı sebeple "/kullanim-sartlari" (308 → /kullanim-kosullari) da yok.
  "/hakkimizda",
  "/iletisim",
  "/giris",
  "/kayit",
  "/gizlilik",
  "/kvkk",
  "/kullanim-kosullari",
  "/cerez-politikasi",
  "/hesap-silme",
];

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
