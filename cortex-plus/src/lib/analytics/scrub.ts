/**
 * Analitiğe giden adresler gizli parça taşımaz (6 Kasım 2026, 360° denetim).
 *
 * PostHog her olaya tam adresi ekliyordu: veli ödeme bağlantısının imzası (`/odeme/veli/<belirteç>`),
 * telefon yükleme kodu (`/yukle/<belirteç>`), sınıf daveti (`/hazirlik-davet/<belirteç>`), beta ve
 * davet kodları (`?kod=…`, `?ref=…`). Bu belirteçler bağlantıyı açan herkese yetki verir; analitikte
 * durmaları gerekmez. Sorgu ve parça (#) tümden düşer; belirteç taşıyan yol parçaları ve kimlikler
 * (UUID ve 20+ karakterlik parçalar) yer tutucuya çevrilir.
 */

const TOKEN_ROUTES = ["odeme/veli", "yukle", "hazirlik-davet", "api/uploads/phone", "email-dogrula"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_TOKEN = /^[A-Za-z0-9._~-]{20,}$/;

/** Yalnız yol kısmı: "/a/b". Belirteçli parçalar ":token", kimlikler ":id". */
export function scrubPath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "";
  const parts = clean.split("/");
  const out = parts.map((segment, index) => {
    if (!segment) return segment;
    const before = parts.slice(1, index).join("/");
    if (TOKEN_ROUTES.some((route) => before === route || before.endsWith(`/${route}`))) return ":token";
    if (UUID.test(segment)) return ":id";
    if (LONG_TOKEN.test(segment)) return ":token";
    return segment;
  });
  return out.join("/") || "/";
}

/** Tam adres ya da yol; adres değilse olduğu gibi döner. Sorgu ve parça düşer. */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  if (value.startsWith("/")) return scrubPath(value);
  try {
    const url = new URL(value);
    return `${url.origin}${scrubPath(url.pathname)}`;
  } catch {
    return value;
  }
}

const URL_PROPERTIES = ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_referrer", "$initial_pathname", "path", "url"];

/** PostHog `sanitize_properties` kancası: adres taşıyan alanlar temizlenir. */
export function sanitizeAnalyticsProperties<T extends Record<string, unknown>>(properties: T): T {
  const next: Record<string, unknown> = { ...properties };
  for (const key of URL_PROPERTIES) {
    if (key in next) next[key] = scrubUrl(next[key]);
  }
  if (typeof next.$set === "object" && next.$set) {
    next.$set = sanitizeAnalyticsProperties(next.$set as Record<string, unknown>);
  }
  if (typeof next.$set_once === "object" && next.$set_once) {
    next.$set_once = sanitizeAnalyticsProperties(next.$set_once as Record<string, unknown>);
  }
  return next as T;
}
