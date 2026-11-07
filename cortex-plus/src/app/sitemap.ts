import type { MetadataRoute } from "next";
import { curriculumSitemapPaths } from "@/lib/curriculum/seo";

const base = "https://cortexplus.app";

const marketingPaths = [
  "",
  "/sinav-hazirligi",
  "/ozellikler",
  "/fiyatlandirma",
  "/yardim",
  "/mobil-uygulama",
  // "/ogretmenler-ve-profesorler-icin" bilerek yok: o sayfa 29 Ağustos'ta
  // emekli edildi ve artık /kayit'e yönlendiriyor. Yönlendirmeye düşen bir
  // adresi site haritasına koymak, Google'a boş yere gezdirilecek bir adres
  // bildirmek demek.
  "/hakkimizda",
  "/iletisim",
  "/giris",
  "/kayit",
  "/gizlilik",
  "/kvkk",
  "/kullanim-kosullari",
  "/cerez-politikasi",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const marketing = marketingPaths.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "" ? 1 : 0.7,
  }));
  // Paket 6: resmî müfredat program/ünite/kazanım sayfaları (kayıt defterinden, ~5.200 adres; sınır 50.000).
  const curriculum = curriculumSitemapPaths().map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: path.split("/").length <= 3 ? 0.6 : 0.4,
  }));
  return [...marketing, ...curriculum];
}
