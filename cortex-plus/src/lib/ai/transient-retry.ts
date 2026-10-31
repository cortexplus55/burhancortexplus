/**
 * Sağlayıcı 5xx / zaman aşımı dersi düşürüyordu.
 *
 * İstemci `maxRetries: 0` ile açılıyor; tek bir 502 veya 90 saniyelik
 * zaman aşımı bütün üretimi çöpe atıyor, kredi iade ediliyor ve öğrenci
 * "Ders şu anda oluşturulamadı" görüyordu. Elle yeniden deneyince aynı
 * istek geçiyordu.
 *
 * Varsayılan: tek yeniden deneme. Outline gibi uzun çağrılar
 * `maxAttempts` ile aynı rezervasyonda birkaç kez dener (üstel backoff).
 * Rezervasyon çağıranın işi; bu fonksiyon rezervasyon açmaz.
 *
 * Fonksiyon tavanı 300 saniye. Bir sonraki çağrı + backoff sığmıyorsa
 * yeniden denenmez — platform kesmesin diye.
 */

import { isQuotaExhaustedError } from "@/lib/ai/openai-client";

const TRANSIENT_BACKOFF_MS = 1_000;
/** Sağlayıcının Retry-After başlığı bu kadarına kadar dinlenir (daha uzunsa bekleyen öğrenci için anlamsız). */
const RETRY_AFTER_CAP_MS = 20_000;
const FUNCTION_BUDGET_MS = 270_000;

export function isTransientProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = error instanceof Error ? error.constructor.name : "";
  if (name === "APIUserAbortError") return false;
  // Kredi bitti (insufficient_quota) de 429 döner ama yeniden denemek bir şey değiştirmez (31 Ekim 2026).
  if (isQuotaExhaustedError(error)) return false;
  const status = "status" in error ? (error as { status?: unknown }).status : undefined;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return name === "APIConnectionError" || name === "APIConnectionTimeoutError";
}

export function transientBackoffMs(attemptIndex: number): number {
  return TRANSIENT_BACKOFF_MS * 2 ** Math.min(Math.max(0, attemptIndex), 4);
}

/**
 * Sağlayıcının "şu kadar sonra dene" dediği süre (`retry-after-ms`, yoksa `retry-after` saniye), en çok 20 sn.
 * Dakikalık sınıra takılan 429'da 1 sn sonra yeniden denemek aynı sınıra yeniden çarpıyordu.
 */
export function retryAfterMs(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const headers = (error as { headers?: unknown }).headers;
  const read = (name: string): string | null => {
    if (!headers || typeof headers !== "object") return null;
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
    const value = (headers as Record<string, unknown>)[name];
    return typeof value === "string" ? value : null;
  };
  const ms = Number(read("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return Math.min(ms, RETRY_AFTER_CAP_MS);
  const seconds = Number(read("retry-after"));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1_000, RETRY_AFTER_CAP_MS);
  return 0;
}

export function transientRetryFits(
  startedAt: number,
  callTimeoutMs: number,
  now = Date.now(),
  backoffMs = TRANSIENT_BACKOFF_MS,
): boolean {
  return now - startedAt + backoffMs + callTimeoutMs <= FUNCTION_BUDGET_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientRetry<T>(
  run: () => Promise<T>,
  options: {
    startedAt: number;
    callTimeoutMs: number;
    /** Total attempts including the first. Default 2 (one retry). Cap 5. */
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 5));
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const next = attempt + 1;
      const backoff = Math.max(transientBackoffMs(attempt), retryAfterMs(error));
      if (
        next >= maxAttempts ||
        !isTransientProviderError(error) ||
        !transientRetryFits(
          options.startedAt,
          options.callTimeoutMs,
          Date.now(),
          backoff,
        )
      ) {
        throw error;
      }
      console.error("educational_generation_transient_retry", {
        errorType: error instanceof Error ? error.constructor.name : "unknown",
        status:
          error && typeof error === "object" && "status" in error
            ? (error as { status?: unknown }).status
            : undefined,
        attempt: next,
        maxAttempts,
        backoffMs: backoff,
      });
      await (options.sleep ?? sleep)(backoff);
    }
  }
  throw lastError;
}
