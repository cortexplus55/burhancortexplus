/**
 * Mobil uygulamanın tarayıcı kimliği işareti (26 Kasım 2026). `capacitor.config.ts` web görünümünün tarayıcı kimliğine
 * `CortexPlusApp/1 (ios)` ya da `CortexPlusApp/1 (android)` ekler. Saf ve sunucuda da çalışır: köprü (window.Capacitor)
 * yüklenmeden önceki ilk betik ve ileride sunucu (ör. mağaza kuralları gereği ödeme sayfası) aynı kararı buradan okur.
 */

export const NATIVE_UA_MARKER = "CortexPlusApp";

export type NativePlatform = "ios" | "android";

const MARKER_PATTERN = /\bCortexPlusApp\/\d+(?:\s*\((ios|android)\))?/i;

/** Tarayıcı kimliği uygulamanınsa platformu, değilse null. Platform yazılmamışsa kimliğin kendisinden çıkarılır. */
export function nativePlatformFromUserAgent(userAgent: string | null | undefined): NativePlatform | null {
  if (!userAgent) return null;
  const match = MARKER_PATTERN.exec(userAgent);
  if (!match) return null;
  const declared = match[1]?.toLowerCase();
  if (declared === "ios" || declared === "android") return declared;
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return "ios";
  return null;
}

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return nativePlatformFromUserAgent(userAgent) !== null;
}

/**
 * Kökteki ilk betik (`src/app/layout.tsx`): köprü ve React yüklenmeden çalışır. Uygulamadaysa `<html>`e `cx-native`
 * sınıfı ve `data-native-platform` yazar; iOS'ta alt güvenli alan (ana ekran çizgisi) için görünüm alanına
 * `viewport-fit=cover` ekler. Android'de web görünümü sistem çubuklarının arasına yerleşir, ek gerekmez.
 * Tarayıcıda hiçbir şey yapmaz.
 */
export const NATIVE_BOOT_SCRIPT = `(function(){try{var ua=navigator.userAgent||"";var m=/CortexPlusApp\\/\\d+(?:\\s*\\((ios|android)\\))?/i.exec(ua);if(!m)return;var p=(m[1]||(/Android/i.test(ua)?"android":"ios")).toLowerCase();var d=document.documentElement;d.classList.add("cx-native");d.setAttribute("data-native-platform",p);if(p==="ios"){var v=document.querySelector('meta[name="viewport"]');if(v&&v.content.indexOf("viewport-fit")<0)v.setAttribute("content",v.content+", viewport-fit=cover");}}catch(e){}})();`;
