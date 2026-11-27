/**
 * Tarama kuralları (26 Kasım 2026, Search Console). Herkese açık sayfalar taranır; yönetim, sunucu uçları, giriş
 * dönüşü (`/auth/`), ödeme (`/pay`) ve ayarlar (`/ayarlar`) taranmaz. Son ikisi oturum ister; taransalar arama
 * sonucunda yalnız giriş sayfasına düşerlerdi. Kapatılan hiçbir adres site haritasında yer almaz
 * (bekçi `seo-search-console.test.tsx`).
 *
 * 27 Kasım 2026 (GEO, ürün sahibinin isteği): öğretmen sohbeti (`/ogretmen`), giriş (`/giris`) ve kayıt (`/kayit`) da
 * kapandı; ikisi site haritasından çıktı. Robots önek eşler: `/ogretmen` emekli `/ogretmenler-ve-profesorler-icin`
 * yönlendirmesini, `/kayit` kayıt bağlantılarının `?hedef=` hâllerini de kapsar.
 *
 * Next.js'in metadata dosyaları (`app/robots.ts`, `app/sitemap.ts`) yalnız varsayılan dışa aktarımı taşır; liste burada.
 */
export const ROBOTS_DISALLOW = ["/admin", "/api/", "/auth/", "/pay", "/ayarlar", "/ogretmen", "/giris", "/kayit"] as const;

/**
 * Arama ve yapay zekâ arama tarayıcıları (27 Kasım 2026, GEO). robots.txt'te adıyla anılan tarayıcı yalnız kendi
 * grubunu okur ve `*` grubunu yok sayar; bu yüzden her biri aynı izni ve aynı kapalı yolları kendi grubunda görür.
 * Adlar tarayıcıların kendi belgelerindeki kullanıcı aracısı adıdır.
 */
export const AI_SEARCH_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Googlebot",
  "Google-Extended",
  "Applebot",
] as const;

/** Bir adresin robots kurallarına göre kapalı olup olmadığı (önek eşleşmesi; `/api/` gibi eğik çizgiyle biten kural da). */
export function isCrawlBlocked(path: string): boolean {
  return ROBOTS_DISALLOW.some((rule) => path === rule.replace(/\/$/, "") || path.startsWith(rule));
}
