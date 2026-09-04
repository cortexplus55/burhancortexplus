/**
 * Sentry'nin üç ortamda (sunucu, edge, tarayıcı) ortak ayarı.
 *
 * Tek yerde durmasının sebebi gizlilik: aynı temizleme kuralı üç dosyada da
 * ayrı ayrı yazılsaydı, biri unutulduğunda öğrenci verisi sessizce dışarı
 * çıkardı.
 */

import type { ErrorEvent } from "@sentry/nextjs";

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
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
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

  return event;
}

/**
 * Gürültü listesi.
 *
 * Bunlar kodda düzeltilecek hatalar değil: kullanıcı sekmeyi kapattığında,
 * tarayıcı eklentisi araya girdiğinde ya da ağ koptuğunda çıkıyor. Panele
 * doldurmalarına izin verirsek gerçek hatalar arada kaybolur.
 */
export const SENTRY_IGNORE = [
  "AbortError",
  "ResizeObserver loop",
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
  "cancelled",
];
