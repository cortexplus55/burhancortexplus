/**
 * Tarama kuralları (26 Kasım 2026, Search Console). Herkese açık sayfalar taranır; yönetim, sunucu uçları, giriş
 * dönüşü (`/auth/`), ödeme (`/pay`) ve ayarlar (`/ayarlar`) taranmaz. Son ikisi oturum ister; taransalar arama
 * sonucunda yalnız giriş sayfasına düşerlerdi. Kapatılan hiçbir adres site haritasında yer almaz
 * (bekçi `seo-search-console.test.tsx`).
 *
 * Next.js'in metadata dosyaları (`app/robots.ts`, `app/sitemap.ts`) yalnız varsayılan dışa aktarımı taşır; liste burada.
 */
export const ROBOTS_DISALLOW = ["/admin", "/api/", "/auth/", "/pay", "/ayarlar"] as const;
