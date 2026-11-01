import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Seviye kontrolü oturum belirteci: hangi soruların bu oturumda sorulduğunu imzalar. Cevap anahtarı yalnız
 * imzalı listedeki soru yanıtlanınca döner; misafir belirteci en çok 3 soru taşır (ön izleme).
 */
import type { LevelSource } from "@/lib/level-check/token-types";
export type { LevelSource };
export type LevelClaims = { uid: string | null; src: LevelSource; items: string[]; exp: number; prep: string | null };

export const LEVEL_TOKEN_TTL_MS = 45 * 60 * 1000;
const TTL_MS = LEVEL_TOKEN_TTL_MS;

function key(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(payload: string, k: string): string {
  return createHmac("sha256", k).update(`level-check:${payload}`).digest("base64url");
}

export function createLevelToken(claims: Omit<LevelClaims, "exp">, now = Date.now()): string | null {
  const k = key();
  if (!k) return null;
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, k)}`;
}

export function verifyLevelToken(token: string | null | undefined, now = Date.now()): LevelClaims | null {
  const k = key();
  if (!k || !token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload, k));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LevelClaims;
    if (!Array.isArray(claims.items) || typeof claims.exp !== "number" || claims.exp < now) return null;
    return claims;
  } catch {
    return null;
  }
}
