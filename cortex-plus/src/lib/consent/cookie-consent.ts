import { COOKIE_POLICY_VERSION } from "@/lib/legal/versions";

/*
  Çerez tercihi (7 Kasım 2026, uyum paketi). Kurul'un çerez rehberi: zorunlu olmayan çerez açık rızayla çalışır;
  rıza verilmeden önce yüklenmez, "Reddet" "Kabul et" kadar kolaydır, tercih kolayca değiştirilir ve makul süre
  sonra yeniden sorulur. Tercih birinci taraf bir çerezde (`cp_consent`, 12 ay) tutulur; giriş yapmış öğrencide
  ayrıca sunucuya yazılır (`/api/consent/cookies`) ki başka cihazda yeniden sorulmasın.

  Bu dosya tarayıcı ve sunucu arasında ortak; `document` yalnız fonksiyonların içinde okunur.
*/

export const COOKIE_CONSENT_NAME = "cp_consent";
export const COOKIE_CONSENT_MAX_AGE_DAYS = 365;
export const COOKIE_CONSENT_EVENT = "cp:consent-changed";
export const OPEN_COOKIE_PREFERENCES_EVENT = "cp:open-cookie-preferences";

export type CookieConsentAction = "accept_all" | "reject_all" | "custom";

export type CookieConsent = {
  /** Politika sürümü; değişince tercih geçersiz sayılır ve yeniden sorulur. */
  v: string;
  /** Analitik çerezlere izin. */
  a: boolean;
  /** Tercihin anı (ms). 12 aydan eskiyse yeniden sorulur. */
  t: number;
  /** Tarayıcıda üretilen tercih kimliği (kayıtta kişi yerine bu tutulur). */
  id: string;
};

const MAX_AGE_MS = COOKIE_CONSENT_MAX_AGE_DAYS * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Çerez değerinden tercih; sürüm farklıysa, süresi dolduysa ya da bozuksa `null` (yeniden sorulur). */
export function parseCookieConsent(raw: string | null | undefined, now: number = Date.now()): CookieConsent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<CookieConsent>;
    if (value.v !== COOKIE_POLICY_VERSION) return null;
    if (typeof value.a !== "boolean" || typeof value.t !== "number" || typeof value.id !== "string") return null;
    if (!UUID.test(value.id)) return null;
    if (value.t > now + 5 * 60_000 || now - value.t > MAX_AGE_MS) return null;
    return { v: value.v, a: value.a, t: value.t, id: value.id };
  } catch {
    return null;
  }
}

export function serializeCookieConsent(consent: CookieConsent): string {
  return encodeURIComponent(JSON.stringify(consent));
}

export function readCookieValue(name: string, cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function readCookieConsent(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  return parseCookieConsent(readCookieValue(COOKIE_CONSENT_NAME, document.cookie));
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.a === true;
}

function newConsentId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* aşağıdaki yedek */
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Tercihi çereze yazar ve sayfaya duyurur. `log: true` iken sunucuya da kaydedilir (kanıt); hesaptan geri yüklenen
 * tercih ikinci kez kaydedilmez.
 */
export function writeCookieConsent(
  analytics: boolean,
  action: CookieConsentAction,
  options: { log?: boolean; id?: string; at?: number } = {},
): CookieConsent {
  const previous = readCookieConsent();
  const consent: CookieConsent = {
    v: COOKIE_POLICY_VERSION,
    a: analytics,
    t: options.at ?? Date.now(),
    id: options.id ?? previous?.id ?? newConsentId(),
  };
  if (typeof document !== "undefined") {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_CONSENT_NAME}=${serializeCookieConsent(consent)}; Path=/; Max-Age=${
      COOKIE_CONSENT_MAX_AGE_DAYS * 86_400
    }; SameSite=Lax${secure}`;
    if (!analytics) clearAnalyticsStorage();
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
  }
  if (options.log !== false && typeof fetch !== "undefined") {
    void fetch("/api/consent/cookies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ consentId: consent.id, analytics, action, policyVersion: consent.v }),
    }).catch(() => {
      /* kayıt düşerse tercih yine çerezde; bir sonraki değişiklikte yeniden yazılır */
    });
  }
  return consent;
}

export function openCookiePreferences(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
}

/**
 * İzin geri alınınca analitik izler tarayıcıdan silinir (PostHog çerezi ve tarayıcı depolaması). Alan adının üst
 * düzeyine yazılmış çerez de silinsin diye iki alan adıyla denenir.
 */
export function clearAnalyticsStorage(): void {
  if (typeof document === "undefined") return;
  const host = typeof location !== "undefined" ? location.hostname : "";
  const domains = ["", host ? `; Domain=${host}` : "", host.includes(".") ? `; Domain=.${host.split(".").slice(-2).join(".")}` : ""];
  for (const part of document.cookie.split(";")) {
    const name = part.trim().split("=")[0];
    if (!name || !/^ph_|^__ph/.test(name)) continue;
    for (const domain of domains) document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
  }
  try {
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (/^ph_|^__ph/.test(key)) storage.removeItem(key);
      }
    }
  } catch {
    /* depolama kapalı */
  }
}
