/**
 * Sağlayıcı 5xx / zaman aşımı dersi düşürüyordu.
 *
 * İstemci `maxRetries: 0` ile açılıyor; tek bir 502 veya 90 saniyelik
 * zaman aşımı bütün üretimi çöpe atıyor, kredi iade ediliyor ve öğrenci
 * "Ders şu anda oluşturulamadı" görüyordu. Elle yeniden deneyince aynı
 * istek geçiyordu.
 *
 * Burada tek bir yeniden deneme var. Kredi rezervasyonu çağıranın işi:
 * bu fonksiyon rezervasyon açmaz. İkinci deneme de düşerse hata aynen
 * yükselir ve çağıran iade eder.
 *
 * Fonksiyon tavanı 300 saniye. Bir 90 saniyelik çağrı, kısa bekleme ve
 * bir yeniden deneme sığıyorsa denenir; sığmıyorsa ikinci çağrı platform
 * kesmesin diye yapılmaz.
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

export function transientRetryFits(
  startedAt: number,
  callTimeoutMs: number,
  now = Date.now(),
): boolean {
  return now - startedAt + TRANSIENT_BACKOFF_MS + callTimeoutMs <= FUNCTION_BUDGET_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientRetry<T>(
  run: () => Promise<T>,
  options: {
    startedAt: number;
    callTimeoutMs: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isTransientProviderError(error) || !transientRetryFits(options.startedAt, options.callTimeoutMs)) {
      throw error;
    }
    console.error("educational_generation_transient_retry", {
      errorType: error instanceof Error ? error.constructor.name : "unknown",
      status:
        error && typeof error === "object" && "status" in error
          ? (error as { status?: unknown }).status
          : undefined,
    });
    await (options.sleep ?? sleep)(TRANSIENT_BACKOFF_MS);
    return await run();
  }
}
