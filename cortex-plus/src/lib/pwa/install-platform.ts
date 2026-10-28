import { googleBlockedWebViewApp } from "@/lib/auth/in-app-browser";

/**
 * Telefona kurulum yolu (28 Ekim 2026). Android/Chrome tek dokunuşla kurar (`beforeinstallprompt`);
 * iOS'ta tarayıcı bu olayı hiç göndermez, kurulum Safari'nin Paylaş menüsünden yapılır. Instagram,
 * Facebook, TikTok tarayıcısı kurulum yapamaz: önce sayfa gerçek tarayıcıda açılmalı.
 */
export type InstallPlatform = "ios" | "ios-other" | "android" | "desktop" | "webview";

export function installPlatform(userAgent: string | null | undefined): InstallPlatform {
  const ua = userAgent ?? "";
  if (googleBlockedWebViewApp(ua)) return "webview";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Platforma göre elle kurulum adımları (tek dokunuşlu kurulum yoksa gösterilir). */
export function installSteps(platform: InstallPlatform, webviewApp?: string | null): string[] {
  switch (platform) {
    case "webview":
      return [
        `${webviewApp ?? "Bu uygulama"}nın tarayıcısı kurulum yapamıyor: sağ üstteki menüden "Tarayıcıda aç"a dokun.`,
        "Açılan Safari ya da Chrome'da bu sayfaya geri gel.",
        "Kurulum düğmesine dokun ya da aşağıdaki adımları izle.",
      ];
    case "ios":
      return [
        "Safari'nin alt çubuğundaki Paylaş düğmesine (kare ve yukarı ok) dokun.",
        "Listede aşağı kaydırıp \"Ana Ekrana Ekle\"ye dokun.",
        "Sağ üstteki \"Ekle\"ye dokun: Cortex Plus ana ekranında uygulama olarak açılır.",
      ];
    case "ios-other":
      return [
        "iPhone'da kurulum yalnız Safari'den yapılır: bu sayfayı Safari'de aç.",
        "Paylaş düğmesine (kare ve yukarı ok) dokun, \"Ana Ekrana Ekle\"yi seç.",
        "\"Ekle\"ye dokun.",
      ];
    case "android":
      return [
        "Chrome'da sağ üstteki üç noktaya (⋮) dokun.",
        "\"Uygulamayı yükle\" ya da \"Ana ekrana ekle\"yi seç.",
        "\"Yükle\"ye dokun: Cortex Plus uygulama çekmecende ve ana ekranında durur.",
      ];
    default:
      return [
        "Chrome ya da Edge'de adres çubuğunun sağındaki kurulum simgesine tıkla.",
        "\"Yükle\"yi seç: Cortex Plus kendi penceresinde açılır.",
        "Telefonda kurmak için bu sayfayı telefonunun tarayıcısında aç: cortexplus.app/mobil-uygulama",
      ];
  }
}
