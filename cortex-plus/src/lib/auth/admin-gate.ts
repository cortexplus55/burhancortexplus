import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_TTL_MS,
  adminGateConfigFrom,
  signAdminGateCookie,
  verifyAdminGateCookie,
  type AdminGateConfig,
} from "@/lib/auth/admin-gate-core";

/**
 * Kapının o anki durumu.
 * - "off": `ADMIN_GATE_PIN_HASH` tanımsız; kapı yok, panel açık, üstte sarı uyarı.
 * - "passed": PIN tanımlı ve bu kullanıcının geçerli kapı çerezi var.
 * - "required": PIN tanımlı, çerez yok ya da geçersiz → /admin/kapi.
 * - "misconfigured": PIN özeti bozuk ya da imza anahtarı yok → panel kapalı, kapı sayfası nedenini söyler.
 */
export type AdminGateStatus =
  | { state: "off"; passed: true }
  | { state: "passed"; passed: true }
  | { state: "required"; passed: false }
  | { state: "misconfigured"; passed: false; reason: "pin_hash_invalid" | "secret_missing" };

export function adminGateConfig(): AdminGateConfig {
  return adminGateConfigFrom({
    ADMIN_GATE_PIN_HASH: process.env.ADMIN_GATE_PIN_HASH,
    APP_SECRET: process.env.APP_SECRET,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function gateStatusFor(config: AdminGateConfig, userId: string, cookieValue: string | undefined, now = Date.now()): AdminGateStatus {
  if (config.state === "off") return { state: "off", passed: true };
  if (config.state === "misconfigured") return { state: "misconfigured", passed: false, reason: config.reason };
  const ok = verifyAdminGateCookie(cookieValue, {
    userId,
    now,
    secret: config.secret,
    fingerprint: config.fingerprint,
  });
  return ok ? { state: "passed", passed: true } : { state: "required", passed: false };
}

/** Bu istekteki kapı durumu (sunucu bileşeni ve sunucu eylemi). */
export async function readAdminGate(userId: string): Promise<AdminGateStatus> {
  const config = adminGateConfig();
  // Kapı yoksa ya da bozuksa çerez okunmaz: sonuç çerezden bağımsız.
  if (config.state !== "on") return gateStatusFor(config, userId, undefined);
  const store = await cookies();
  return gateStatusFor(config, userId, store.get(ADMIN_GATE_COOKIE)?.value);
}

/** PIN doğrulandıktan sonra çerezi yazar (yalnız sunucu eylemi). */
export async function issueAdminGateCookie(userId: string): Promise<boolean> {
  const config = adminGateConfig();
  if (config.state !== "on") return false;
  const store = await cookies();
  store.set(ADMIN_GATE_COOKIE, signAdminGateCookie({ userId, now: Date.now(), secret: config.secret, fingerprint: config.fingerprint }), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(ADMIN_GATE_TTL_MS / 1000),
  });
  return true;
}

export async function clearAdminGateCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_GATE_COOKIE);
}
