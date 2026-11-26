import { isNativeUserAgent } from "@/lib/platform/native-ua";

/**
 * Mobil uygulamada web ödemesi yok (26 Kasım 2026, mağaza uyumluluğu). App Store 3.1.1 ve Google Play ödeme politikası:
 * uygulamanın içinde dijital içerik yalnız mağazanın satın almasıyla satılır; PayTR, veli ödeme bağlantısı, beta ve
 * kampanya kodu ya da dışarıdaki bir ödemeye yönlendiren bağlantı görünmez. Karar tek yerde ve sunucuda: middleware her
 * istekte tarayıcı kimliğine (`native-ua.ts`) bakar.
 *
 * - Web'e özgü ödeme sayfaları uygulamada açılmaz, uygulamanın abonelik ekranına (`/pay`) yönlenir. `/pay` uygulamada
 *   yalnız mağaza aboneliğini çizer (`NativeSubscriptionScreen`).
 * - Ödeme başlatan uçlar uygulamadan gelen isteği 403 ile reddeder: bir düğme gözden kaçsa bile ödeme açılmaz.
 * - Ödeme geçmişi (`/odemeler`) ve abonelik durumu okunur: web'den alınmış bir planı uygulamada görmek serbesttir
 *   (App Store 3.1.3(b), çok platformlu hizmet).
 *
 * Tarayıcıda hiçbir şey değişmez: kimlikte uygulama işareti yoksa karar `null`.
 */

/** Uygulamada açılmayan, abonelik ekranına yönlenen sayfalar (önekleriyle). */
export const NATIVE_WEB_ONLY_PAGES = ["/fiyatlandirma", "/odeme", "/veli-odeme"] as const;

/**
 * Web'in tanıtım sayfaları: web fiyatı, PayTR ve veli ödeme bağlantısı anlatılır. Uygulamada açılmaz, ana sayfaya
 * yönlenir (misafir orada kayda, öğrenci kendi ana ekranına gider).
 */
export const NATIVE_MARKETING_PAGES = ["/ozellikler", "/ornek", "/sinav-hazirligi"] as const;

/** Uygulamada oturumsuz ziyaretçinin ana sayfası: tanıtım sayfası yerine kayıt. */
export const NATIVE_GUEST_HOME = "/kayit";

/** Uygulamadan gelen isteği reddedilen, ödeme ya da ücretsiz Plus açan uçlar (önekleriyle). */
export const NATIVE_BLOCKED_APIS = [
  "/api/payments/paytr/create-token",
  "/api/payments/parent-link",
  "/api/billing/parent-link",
  "/api/promo/redeem",
] as const;

/** Uygulamada web ödemesinin yerine açılan ekran. */
export const NATIVE_SUBSCRIPTION_PATH = "/pay";

export type NativePaymentDecision =
  | { kind: "redirect"; to: typeof NATIVE_SUBSCRIPTION_PATH | "/" }
  | { kind: "block"; status: 403; error: "native_store_only" }
  | null;

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function nativePaymentDecision(path: string, userAgent: string | null | undefined): NativePaymentDecision {
  if (!isNativeUserAgent(userAgent)) return null;
  if (NATIVE_BLOCKED_APIS.some((prefix) => underPrefix(path, prefix))) {
    return { kind: "block", status: 403, error: "native_store_only" };
  }
  if (NATIVE_WEB_ONLY_PAGES.some((prefix) => underPrefix(path, prefix))) {
    return { kind: "redirect", to: NATIVE_SUBSCRIPTION_PATH };
  }
  if (NATIVE_MARKETING_PAGES.some((prefix) => underPrefix(path, prefix))) {
    return { kind: "redirect", to: "/" };
  }
  return null;
}

/** Uygulamada oturumsuz ziyaretçi ana sayfayı açınca kayda gider (tanıtım sayfası web fiyatını ve PayTR'yi anlatır). */
export function nativeGuestHomeRedirect(path: string, userAgent: string | null | undefined, signedIn: boolean): string | null {
  if (signedIn || path !== "/") return null;
  return isNativeUserAgent(userAgent) ? NATIVE_GUEST_HOME : null;
}

/** Reddedilen isteğin cevabı: öğrenciye okunur cümle, istemciye sabit kod. */
export const NATIVE_STORE_ONLY_MESSAGE =
  "Uygulamada satın alma yalnız App Store ya da Google Play üzerinden yapılır.";
