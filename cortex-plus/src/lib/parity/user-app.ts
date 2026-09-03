/**
 * Üretilen mini uygulama belgesinin biçim denetimi.
 *
 * Burada HTML "temizlenmiyor". Yarım bir temizlik en tehlikeli seçenek olurdu:
 * güvenlik hissi verir ama atlatılır. İzolasyon çalıştırma tarafında —
 * sandbox="allow-scripts" (allow-same-origin YOK) + ağa kapalı CSP.
 * Bkz. components/parity/user-app-frame.tsx.
 *
 * Buradaki tek iş, elimizde gerçekten çalıştırılabilir bir belge olduğunu ve
 * boyutunun makul kaldığını doğrulamak.
 */

/** Veritabanı kısıtıyla aynı üst sınır. */
export const MAX_APP_HTML = 200_000;
const MIN_APP_HTML = 200;

/**
 * Model bazen belgeyi kod çiti içine alıyor ya da başına bir cümle ekliyor.
 * Belgeyi çıkarır; çıkaramazsa null döner (çağıran krediyi iade eder).
 */
export function extractAppDocument(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  // ```html … ``` sarmalını at.
  const fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(text);
  if (fence) text = fence[1].trim();

  // Belgeden önce açıklama yazılmışsa <!DOCTYPE ya da <html'den başlat.
  const start = text.search(/<!DOCTYPE\s+html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);

  // Belgeden sonra yazılmışsa </html>'de kes.
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) text = text.slice(0, end + "</html>".length);

  text = text.trim();

  if (text.length < MIN_APP_HTML || text.length > MAX_APP_HTML) return null;
  if (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text)) return null;
  // İçinde çalışacak bir şey yoksa "uygulama" değil.
  if (!/<script[\s>]/i.test(text) && !/<canvas[\s>]/i.test(text)) return null;

  return text;
}

/**
 * Uygulamanın çalıştığı iframe'in CSP'si.
 *
 * `default-src 'none'` ağ erişimini tamamen kapatıyor: model yönergeye
 * uymayıp bir CDN ya da fetch koyarsa istek hiç çıkmıyor. Satır içi script
 * ve stile izin var, çünkü uygulama tek dosya.
 */
export const APP_FRAME_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src data:; " +
  "font-src data:; " +
  "media-src data:; " +
  "form-action 'none'; " +
  "base-uri 'none'";

/** Belgeye CSP meta'sını enjekte eder; <head> yoksa <html>'den sonra açar. */
export function withFrameCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_FRAME_CSP}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  }
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${meta}</head>`);
}
