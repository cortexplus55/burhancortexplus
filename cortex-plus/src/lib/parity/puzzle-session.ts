import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

/**
 * Bulmaca oturumu jetonu.
 *
 * Süreyi istemciye sordurmuyoruz: tarayıcıdan gelen "0,4 saniyede çözdüm"
 * iddiası liderlik tablosunu anlamsız kılardı. Bunun yerine bulmaca açılırken
 * sunucu imzalı bir başlangıç anı veriyor, bitişte süreyi yine sunucu ölçüyor.
 *
 * Bu, oyalanarak süreyi UZATMAYI engellemez — ama oradaki teşvik ters yönde.
 * Engellediği şey süreyi kısaltmak.
 */

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function secret(): string {
  // Prod'da ikisinden biri her zaman var. APP_SECRET tercih ediliyor;
  // yoksa servis anahtarı da sunucuya özel ve yeterli.
  const key = env.APP_SECRET ?? env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("puzzle_session_secret_missing");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issuePuzzleToken(userId: string, puzzleId: string): string {
  const payload = JSON.stringify({ u: userId, p: puzzleId, t: Date.now() });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type PuzzleTokenResult =
  | { ok: true; elapsedMs: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "mismatch" | "expired" };

export function readPuzzleToken(
  token: string,
  userId: string,
  puzzleId: string,
  now = Date.now(),
): PuzzleTokenResult {
  const [body, signature] = token.split(".");
  if (!body || !signature) return { ok: false, reason: "malformed" };

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: { u?: string; p?: string; t?: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.u !== userId || parsed.p !== puzzleId) {
    return { ok: false, reason: "mismatch" };
  }
  if (typeof parsed.t !== "number") return { ok: false, reason: "malformed" };

  const elapsedMs = now - parsed.t;
  if (elapsedMs < 0 || elapsedMs > MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, elapsedMs };
}
