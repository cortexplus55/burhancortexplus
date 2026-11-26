/**
 * Mobil uygulamada dışarıdan gelen bağlantıların uygulama içi yola çevrilmesi (26 Kasım 2026). Saf.
 * - Bildirim: gövdedeki `url` (APNs) ya da `data.url` (FCM) yalnız "/..." ise kabul edilir.
 * - Uygulamayı açan adres (evrensel bağlantı, `app.cortexplus.mobile://` şeması): yalnız kendi alan adımızsa ya da
 *   uygulamanın kendi şemasıysa yol alınır. Başka her adres yok sayılır (uygulama başka siteye yönlenmez).
 */

const OWN_HOSTS = new Set(["cortexplus.app", "www.cortexplus.app"]);
const APP_SCHEME = "app.cortexplus.mobile:";

function safePath(path: string): string | null {
  const value = path.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 400);
}

export function pushActionPath(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as { url?: unknown }).url;
  return typeof raw === "string" ? safePath(raw) : null;
}

export function appUrlPath(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const own =
    (parsed.protocol === "https:" && OWN_HOSTS.has(parsed.hostname)) || parsed.protocol === APP_SCHEME;
  if (!own) return null;
  // Şemalı adreste ("app.cortexplus.mobile://deneme-sinavlari/abc") ilk parça ana makine adı olarak okunur.
  const path = parsed.protocol === APP_SCHEME && parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname;
  return safePath(`${path || "/"}${parsed.search}${parsed.hash}`);
}
