import { useSyncExternalStore } from "react";

/**
 * Google, uygulamaların kendi tarayıcısında (WebView) oturum açmayı reddeder ("403
 * disallowed_useragent"). Kapalı beta duyurusu Instagram'dan geliyor (20 Ekim 2026): öğrenci
 * "Google ile devam et"e basınca Google'ın hata sayfasını görüyordu. Bu tarayıcıyı tanıyınca düğme
 * yerine e-postayla devam etmeyi ya da sayfayı tarayıcıda açmayı söyleriz. WhatsApp ve Telegram
 * bağlantıyı gerçek tarayıcıda açar; listede yok.
 */
const WEBVIEW_APPS: [RegExp, string][] = [
  [/\bInstagram\b/i, "Instagram"],
  [/FBAN\/|FBAV\/|FB_IAB\//, "Facebook"],
  [/BytedanceWebview|musical_ly|\bTikTok\b/i, "TikTok"],
];

export function googleBlockedWebViewApp(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  for (const [pattern, app] of WEBVIEW_APPS) if (pattern.test(userAgent)) return app;
  return null;
}

/**
 * Uygulamanın kendi tarayıcısı (31 Ekim 2026): Google girişinin reddettikleri ve WhatsApp. WhatsApp
 * bağlantıyı çoğunlukla gerçek tarayıcıda açar (Google girişi orada çalışır, yukarıdaki listede yok),
 * ama bazı sürümlerde kendi tarayıcısında açıyor; tarayıcı kimliğinde "WhatsApp" geçer. Bu
 * tarayıcılarda ses çalma ve dosya yükleme kısıtlı: site başında "tarayıcıda aç" önerilir
 * (`in-app-browser-banner.tsx`). Google kuralı ayrı kalır, bu işlev onu değiştirmez.
 */
const IN_APP_ONLY: [RegExp, string][] = [[/\bWhatsApp\b/i, "WhatsApp"]];

export function inAppBrowserApp(userAgent: string | null | undefined): string | null {
  const blocked = googleBlockedWebViewApp(userAgent);
  if (blocked || !userAgent) return blocked;
  for (const [pattern, app] of IN_APP_ONLY) if (pattern.test(userAgent)) return app;
  return null;
}

const subscribe = () => () => undefined;

/** Sunucuda ve hidrasyonda null (iki çizim aynı kalsın); tarayıcıda tarayıcı kimliğinden okunur. */
export function useGoogleBlockedWebViewApp(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => googleBlockedWebViewApp(navigator.userAgent),
    () => null,
  );
}
