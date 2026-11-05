/**
 * E-posta şablonlarına giren her dinamik değer buradan geçer (6 Kasım 2026, 360° denetim P0).
 *
 * Kayıtta ad serbest yazılıyor ve herkes başkasının adresiyle kayıt olabiliyor. Ad doğrulama
 * e-postasının HTML'ine olduğu gibi giriyordu: ad kutusuna bağlantı yazan biri, bizim doğrulanmış
 * alan adımızdan herhangi bir adrese oltalama e-postası gönderebiliyordu. Kaçış HTML'i kapatır;
 * `personName` ayrıca adresi ve bağlantıyı adın içinden atar (posta uygulamaları düz metindeki
 * "evil.com"u da bağlantıya çeviriyor).
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Kişi adı yalnız harf, boşluk, kesme ve tire taşır; nokta, iki nokta, eğik çizgi, @ ve rakam
 * düşer (alan adı ve bağlantı kurulamaz). En çok `maxWords` sözcük ve 40 karakter.
 */
export function personName(value: unknown, maxWords = 3): string {
  const letters = String(value ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return letters.split(" ").filter(Boolean).slice(0, maxWords).join(" ").slice(0, 40).trim();
}

/** Bağlantı yalnız bizim adresimizle başlıyorsa olduğu gibi; değilse ana sayfa. */
export function safeAppHref(href: string, appOrigin: string): string {
  try {
    const url = new URL(href);
    return url.origin === new URL(appOrigin).origin ? url.toString() : appOrigin;
  } catch {
    return appOrigin;
  }
}
