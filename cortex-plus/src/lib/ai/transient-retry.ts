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

const TRANSIENT_BACKOFF_MS = 1_000;
const FUNCTION_BUDGET_MS = 270_000;

export function isTransientProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = error instanceof Error ? error.constructor.name : "";
  if (name === "APIUserAbortError") return false;
  const status = "status" in error ? (error as { status?: unknown }).status : undefined;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return name === "APIConnectionError" || name === "APIConnectionTimeoutError";
}

export function transientBackoffMs(attemptIndex: number): number {
  return TRANSIENT_BACKOFF_MS * 2 ** Math.min(Math.max(0, attemptIndex), 4);
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
      const backoff = transientBackoffMs(attempt);
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
