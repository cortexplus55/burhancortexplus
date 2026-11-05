/**
 * Sentry'nin üç ortamda (sunucu, edge, tarayıcı) ortak ayarı.
 *
 * Tek yerde durmasının sebebi gizlilik: aynı temizleme kuralı üç dosyada da
 * ayrı ayrı yazılsaydı, biri unutulduğunda öğrenci verisi sessizce dışarı
 * çıkardı.
 */

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Hata takibinin adresi (DSN).
 *
 * Tek değişken kullanıyoruz: DSN gizli bir anahtar değil, zaten tarayıcı
 * paketinin içine gömülüyor. Bu yüzden `NEXT_PUBLIC_` öneki hem sunucuda hem
 * tarayıcıda çalışıyor ve panele tek satır girmek yetiyor. `SENTRY_DSN`
 * yalnızca yerelde eskiden yazılmış satır bozulmasın diye yedek olarak duruyor.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";

/** Panelde hangi ortamdan geldiğini ayırt etmek için. */
export const SENTRY_ENV =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";

/**
 * Hataya iliştirilen veriden öğrenciye ait olabilecek her şeyi siliyoruz.
 *
 * Burası bir eğitim uygulaması ve kullanıcıların bir kısmı çocuk. Sentry'nin
 * varsayılanı zaten IP ve çerez göndermiyor (`sendDefaultPii: false`), ama
 * istek gövdesi ve sorgu dizesi hata nesnesine iliştiğinde öğrencinin yazdığı
 * soru metni de gidebiliyor. Onları elle siliyoruz.
 */
/** Uzun belirteç benzeri yol parçası (imzalı bağlantı, telefon kodu, UUID). */
const TOKEN_SEGMENT = /^[A-Za-z0-9._-]{20,}$/;
/** Yalnız küçük harf ve tireden oluşan uzun sayfa adı ("ogretmenler-ve-profesorler-icin") belirteç değildir. */
const SLUG_SEGMENT = /^[a-z]+(?:-[a-z]+)+$/;
export const REDACTED_SEGMENT = "[redacted]";

/**
 * Adresi Sentry'ye gitmeden temizler (6 Kasım 2026): sorgu ve parça (#…) atılır, uzun belirteç
 * benzeri yol parçaları `[redacted]` olur. Velime ödeme bağlantısı, hazırlık daveti ve telefon
 * yükleme kodu yolun içinde taşınıyor; hata kaydına düşen adres bağlantının kendisini sızdırıyordu.
 */
export function scrubUrl(raw: string): string {
  if (!raw) return raw;
  const cut = raw.search(/[?#]/);
  const base = cut >= 0 ? raw.slice(0, cut) : raw;
  const schemeEnd = base.indexOf("://");
  const pathStart = schemeEnd >= 0 ? base.indexOf("/", schemeEnd + 3) : 0;
  if (pathStart < 0) return base;
  const origin = base.slice(0, pathStart);
  const path = base
    .slice(pathStart)
    .split("/")
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        decoded = segment;
      }
      return TOKEN_SEGMENT.test(decoded) && !SLUG_SEGMENT.test(decoded) ? REDACTED_SEGMENT : segment;
    })
    .join("/");
  return `${origin}${path}`;
}

/**
 * İz kırıntısındaki adresler de aynı temizlikten geçer (fetch/xhr `url`, gezinme `from`/`to`).
 * Kırıntı atılmaz; yalnız adresleri temizlenir.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"] as const) {
      const value = data[key];
      if (typeof value === "string") data[key] = scrubUrl(value);
    }
  }
  if (typeof breadcrumb.message === "string" && breadcrumb.category === "navigation") {
    breadcrumb.message = scrubUrl(breadcrumb.message);
  }
  return breadcrumb;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    if (typeof event.request.url === "string") event.request.url = scrubUrl(event.request.url);
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
  }

  if (event.user) {
    // Kimin hata aldığını bilmek için kimlik yetiyor; e-posta gerekmiyor.
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => scrubBreadcrumb(breadcrumb));
  }

  return event;
}

/**
 * Gürültü listesi.
 *
 * Bunlar kodda düzeltilecek hatalar değil: kullanıcı sekmeyi kapattığında,
 * tarayıcı eklentisi araya girdiğinde ya da ağ koptuğunda çıkıyor. Panele
 * doldurmalarına izin verirsek gerçek hatalar arada kaybolur.
 */
export const SENTRY_IGNORE: (string | RegExp)[] = [
  "AbortError",
  "ResizeObserver loop",
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
  // Safari'nin iptal edilen isteği yalnız "cancelled" der. Düz metin Sentry'de alt dize eşleşir ve
  // "request_cancelled" gibi gerçek hataları da gizliyordu (6 Kasım 2026): yalnız iletinin kendisi.
  /^(?:TypeError: )?cancelled$/,
];
