import type { MetadataRoute } from "next";

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
  "/yaratici-program",
  "/hakkimizda",
  "/iletisim",
  "/giris",
  "/kayit",
  "/gizlilik",
  "/kvkk",
  "/kullanim-kosullari",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return marketingPaths.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
