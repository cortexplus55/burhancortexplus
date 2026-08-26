import type { MetadataRoute } from "next";

const base = "https://cortexplus.app";

const marketingPaths = [
  "",
  "/sinav-hazirligi",
  "/ozellikler",
  "/fiyatlandirma",
  "/yardim",
  "/mobil-uygulama",
  "/ogretmenler-ve-profesorler-icin",
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
