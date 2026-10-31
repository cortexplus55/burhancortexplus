import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { OTHER_DEVICE_PARAM } from "@/lib/auth/device-limit";

/**
 * Hesap paylaşımı koruması (31 Ekim 2026, ürün sahibinin kararı): bir hesap aynı anda en çok 2 cihazda açık kalır.
 * Üçüncü cihaz girince yeni cihaz açık kalır, en uzun süredir görünmeyen cihazın oturumu kapanır; yönetici muaf.
 * Sayım ve düşürme tek kilitle SQL'de (`touch_device_session`, göç 20261031170000); burası ara katmanın iki sorusu:
 *
 *   - Oturumlu istek (`checkSignedInDevice`): bu oturumu "görüldü" yaz. Her istekte sormayız: imzalı, httpOnly
 *     `cp_device` çerezi bu tarayıcının hangi oturumu en son ne zaman sorduğunu taşır; 5 dakikadan yeniyse sorgu yok.
 *     İmza şart: çerezi elle yazan bir tarayıcı sorulmadan kalsaydı hiç sayılmaz, sınır delinirdi.
 *   - Oturumsuz istek (`checkSignedOutDevice`): düşürülen cihazın Supabase oturumu silinir, getUser "kullanıcı yok"
 *     döner. Çerezdeki oturum cihaz sınırıyla düştüyse girişe "başka cihaz" notuyla gönderilir; yoksa çerez silinir.
 *
 * Her hata geçirir (`accountActiveOrUnknown` ile aynı ilke): bizim hatamız yüzünden öğrenci dışarıda kalmaz. Anahtar
 * yoksa, RPC yoksa (göç uygulanmadıysa) ya da veritabanı geç kalırsa istek olduğu gibi devam eder.
 */

export const DEVICE_COOKIE = "cp_device";
/** Aynı tarayıcı aynı oturumu en çok bu aralıkla sorar. */
export const DEVICE_CHECK_INTERVAL_MS = 5 * 60_000;
/** Çerez uzun yaşar: oturum düşünce not için oturum kimliğini taşır; sorma zamanı değerin içinde. */
const DEVICE_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Veritabanı bundan geç cevap verirse geçiririz; sayfa açılışı beklemez. */
export const DEVICE_CHECK_TIMEOUT_MS = 1_500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeviceCookieUpdate = { kind: "set"; value: string } | { kind: "clear" } | null;
export type DeviceGate = { revoked: true } | { revoked: false; cookie: DeviceCookieUpdate };

/** Testler servis istemcisini, saati ve sırrı verir; ara katman ortamdan alır. */
export type DeviceDeps = { service?: SupabaseClient | null; secret?: string | null; now?: number };

const PASS: DeviceGate = { revoked: false, cookie: null };
const CLEAR: DeviceGate = { revoked: false, cookie: { kind: "clear" } };

/** Öteki imzalı bağlantılarla aynı sıra (lesson-prefetch, parent-link): APP_SECRET, yoksa servis anahtarı. */
function deviceSecret(): string | null {
  return process.env.APP_SECRET || process.env.SUPABASE_SECRET_KEY || null;
}

function serviceFromEnv(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Erişim jetonunun `session_id` iddiası. İmza burada doğrulanmaz: çağıran aynı jetonu az önce `getUser` ile
 * Supabase'e doğrulatmıştır. Jeton yenilense de oturum kimliği aynı kalır; cihaz = oturum.
 */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { session_id?: unknown } | null;
    const id = payload?.session_id;
    return typeof id === "string" && UUID_RE.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Kenar çalışma ortamında `node:crypto` yok; Web Crypto her iki ortamda da var. */
async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Değer: `<oturum>.<sorulduğu an, ms>.<imza>`. */
export async function signDeviceCookie(sessionId: string, checkedAt: number, secret: string): Promise<string> {
  const payload = `${sessionId}.${checkedAt}`;
  return `${payload}.${await hmacHex(secret, `cp-device:${payload}`)}`;
}

/** İmzası tutmayan, bozuk ya da eski biçimli çerez yok sayılır (o istek sorulur). */
export async function readDeviceCookie(
  value: string | null | undefined,
  secret: string,
): Promise<{ sessionId: string; checkedAt: number } | null> {
  const [sessionId, checkedAtText, signature, ...rest] = (value ?? "").split(".");
  if (!sessionId || !checkedAtText || !signature || rest.length || !UUID_RE.test(sessionId)) return null;
  if (!/^\d{1,15}$/.test(checkedAtText)) return null;
  const expected = await hmacHex(secret, `cp-device:${sessionId}.${checkedAtText}`);
  if (!sameText(signature, expected)) return null;
  return { sessionId: sessionId.toLowerCase(), checkedAt: Number(checkedAtText) };
}

/** Önceden getirme (bağlantı üstünde gezinme) isteği sorulmaz: aynı anda onlarcası gelir, cevabı gezinme değildir. */
export function isPrefetchRequest(request: Pick<NextRequest, "headers">): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch") === true
  );
}

/**
 * `AbortSignal.timeout` yoksa (eski kenar çalışma ortamı) elle kurulur: yokluğu her soruyu "hata" yapıp sınırı
 * sessizce kapatırdı.
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

type TouchVerdict = "ok" | "revoked" | "unknown";

async function touchDeviceSession(
  service: SupabaseClient,
  input: { userId: string; sessionId: string; userAgent: string | null },
): Promise<{ verdict: TouchVerdict; code?: string }> {
  try {
    const { data, error } = await service
      .rpc("touch_device_session", {
        p_user_id: input.userId,
        p_session_id: input.sessionId,
        p_user_agent: input.userAgent,
      })
      .abortSignal(timeoutSignal(DEVICE_CHECK_TIMEOUT_MS));
    if (error) return { verdict: "unknown", code: (error as { code?: string }).code ?? "error" };
    if (!data || typeof data !== "object") return { verdict: "unknown", code: "shape" };
    return { verdict: (data as { revoked?: unknown }).revoked === true ? "revoked" : "ok" };
  } catch {
    return { verdict: "unknown", code: "thrown" };
  }
}

/**
 * Oturumlu istek. Sorulma zamanı gelmediyse hiçbir şey yapmaz; geldiyse sorar ve çerezi tazeler. Sorulamadıysa
 * (hata, zaman aşımı, göç yok) yine tazeler: hata sürerken her istek beklemesin, 5 dakika sonra yeniden denenir.
 */
export async function checkSignedInDevice(
  input: {
    request: Pick<NextRequest, "cookies" | "headers">;
    auth: Pick<SupabaseClient["auth"], "getSession">;
    userId: string;
  },
  deps: DeviceDeps = {},
): Promise<DeviceGate> {
  try {
    if (isPrefetchRequest(input.request)) return PASS;
    const secret = deps.secret === undefined ? deviceSecret() : deps.secret;
    if (!secret) return PASS;
    const { data } = await input.auth.getSession();
    const sessionId = sessionIdFromAccessToken(data.session?.access_token);
    if (!sessionId) return PASS;
    const now = deps.now ?? Date.now();
    const seen = await readDeviceCookie(input.request.cookies.get(DEVICE_COOKIE)?.value, secret);
    if (seen && seen.sessionId === sessionId) {
      const age = now - seen.checkedAt;
      if (age >= 0 && age < DEVICE_CHECK_INTERVAL_MS) return PASS;
    }
    const service = deps.service === undefined ? serviceFromEnv() : deps.service;
    if (!service) return PASS;
    const touched = await touchDeviceSession(service, {
      userId: input.userId,
      sessionId,
      userAgent: input.request.headers.get("user-agent"),
    });
    if (touched.verdict === "revoked") return { revoked: true };
    if (touched.verdict === "unknown") console.warn("device_session_unavailable", { code: touched.code });
    return { revoked: false, cookie: { kind: "set", value: await signDeviceCookie(sessionId, now, secret) } };
  } catch {
    console.warn("device_session_unavailable", { code: "gate" });
    return PASS;
  }
}

/**
 * Oturumsuz istek, çerezde imzalı bir oturum varken. Tek okuma, sonra çerez gider: aynı tarayıcı bir daha sormaz.
 * Okunamazsa not gösterilmez, öğrenci düz giriş ekranını görür (geçirmenin en zararsız hâli).
 */
export async function checkSignedOutDevice(
  request: Pick<NextRequest, "cookies" | "headers">,
  deps: DeviceDeps = {},
): Promise<DeviceGate> {
  const raw = request.cookies.get(DEVICE_COOKIE)?.value;
  if (!raw) return PASS;
  // Önceden getirmenin cevabı gezinme değil: çerezi orada silersek asıl gezinmede not kaybolur.
  if (isPrefetchRequest(request)) return PASS;
  try {
    const secret = deps.secret === undefined ? deviceSecret() : deps.secret;
    if (!secret) return CLEAR;
    const seen = await readDeviceCookie(raw, secret);
    if (!seen) return CLEAR;
    const service = deps.service === undefined ? serviceFromEnv() : deps.service;
    if (!service) return CLEAR;
    const { data, error } = await service
      .from("user_device_sessions")
      .select("revoked_at")
      .eq("session_id", seen.sessionId)
      .abortSignal(timeoutSignal(DEVICE_CHECK_TIMEOUT_MS))
      .maybeSingle();
    if (error) {
      console.warn("device_session_unavailable", { code: (error as { code?: string }).code ?? "lookup" });
      return CLEAR;
    }
    return (data as { revoked_at?: unknown } | null)?.revoked_at ? { revoked: true } : CLEAR;
  } catch {
    console.warn("device_session_unavailable", { code: "lookup" });
    return CLEAR;
  }
}

/** Çerezi yanıta yazar ya da siler; güncelleme yoksa yanıt olduğu gibi. */
export function applyDeviceCookie(
  response: NextResponse,
  update: DeviceCookieUpdate,
  request: Pick<NextRequest, "nextUrl">,
): NextResponse {
  if (!update) return response;
  response.cookies.set(DEVICE_COOKIE, update.kind === "set" ? update.value : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: update.kind === "set" ? DEVICE_COOKIE_MAX_AGE_S : 0,
  });
  return response;
}

/**
 * Cihaz sınırıyla düşen tarayıcı girişe notla gider. Uygulama sayfasındaysa `next` korunur: yeniden giriş yapınca
 * kaldığı yere döner. `carry`: o ana kadar yazılan oturum çerezleri (çıkışın sildikleri dahil).
 */
export function otherDeviceRedirect(
  request: Pick<NextRequest, "nextUrl">,
  carry: NextResponse,
  keepNext: boolean,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/giris";
  url.search = "";
  url.searchParams.set("oturum", OTHER_DEVICE_PARAM);
  if (keepNext) url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(url);
  for (const cookie of carry.cookies.getAll()) response.cookies.set(cookie);
  return applyDeviceCookie(response, { kind: "clear" }, request);
}
