/**
 * Zaman aşımlı ve yeniden denemeli fetch (30 Ekim 2026, Paket I).
 *
 * Neden: canlı stres testinde sözlü denemenin cevap kaydı tek `fetch` ile, zaman aşımsız ve
 * yeniden denemesiz gidiyordu. Askıda kalan bir istek "Cevapların kaydediliyor…" yazısını
 * dakikalarca tutuyor, düğmeleri kilitliyordu; sayfa yenilenince 2-5. cevaplar yoktu.
 *
 * Kural: her deneme kendi zaman aşımıyla; ağ hatası, zaman aşımı ve 5xx yeniden denenir
 * (1 s, 3 s, 8 s), 4xx (stale_version, yetki) denenmez — yeniden denemek hiçbir şeyi değiştirmez.
 * Çağıranın `signal`i isteği "aşıldı" diye iptal edebilir: yeni cevap kümesi geldiğinde askıdaki
 * eski istek beklenmez (exam-node-session.tsx `persistAnswers`).
 *
 * Saf modül: `fetch` ve `sleep` dışarıdan verilebilir, testler sahte zamanlayıcıyla koşar.
 */

/** Cevap kaydı: tek deneme en çok 15 sn. */
export const SAVE_TIMEOUT_MS = 15_000;
/** Cevap kaydı: üç yeniden deneme, artan bekleme. */
export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 8_000];
/** Bitirme (`complete`): 60 sn; sonrası yoklamaya düşer, yeniden deneme yok (ikinci notlandırma açmasın). */
export const COMPLETE_TIMEOUT_MS = 60_000;

export type RetryFetchReason = "timeout" | "network" | "superseded";

export class RetryFetchError extends Error {
  constructor(
    public readonly reason: RetryFetchReason,
    public readonly attempts: number,
  ) {
    super(
      reason === "timeout"
        ? "İstek zaman aşımına uğradı."
        : reason === "network"
          ? "Bağlantı kurulamadı."
          : "İstek yenisiyle değiştirildi.",
    );
    this.name = "RetryFetchError";
  }
}

export function isRetryFetchError(error: unknown): error is RetryFetchError {
  return error instanceof RetryFetchError;
}

/** Zaman aşımı ya da ağ hatası: sunucu isteği almış da olabilir, almamış da. */
export function isTransportFailure(error: unknown): boolean {
  return isRetryFetchError(error) && error.reason !== "superseded";
}

/** Yalnız 5xx yeniden denenir; 4xx kararı değiştirmez (429 da dahil — sınıra yüklenmeyelim). */
export function retryableStatus(status: number): boolean {
  return status >= 500;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** İptal edilebilir bekleme: `signal` gelirse süre dolmadan döner. */
export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

export type FetchWithRetryOptions = {
  /** Tek denemenin tavanı. */
  timeoutMs: number;
  /** Yeniden denemeler arası bekleme; uzunluğu yeniden deneme sayısıdır. Boşsa tek deneme. */
  retryDelaysMs: readonly number[];
  /** Çağıranın iptali: askıdaki istek de bekleme de hemen biter (`superseded`). */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  /** Kayıt için: kaçıncı deneme, neden. */
  onRetry?: (attempt: number, reason: RetryFetchReason | number) => void;
};

/**
 * Yanıt gelirse (4xx dahil) yanıtı döndürür — durumu çağıran okur. Yalnız 5xx'te deneme hakkı
 * varsa yeniden dener; hak bitince son 5xx yanıtı da döner. Zaman aşımı ve ağ hatasında hak
 * bitince `RetryFetchError` fırlatır; çağıranın `signal`i iptal edince `superseded`.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? abortableSleep;
  const maxAttempts = options.retryDelaysMs.length + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new RetryFetchError("superseded", attempt - 1);
    const controller = new AbortController();
    let timedOut = false;
    let superseded = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    const onOuterAbort = () => {
      superseded = true;
      controller.abort();
    };
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    let response: Response | null = null;
    let failure: RetryFetchReason | null = null;
    try {
      response = await fetchImpl(input, { ...init, signal: controller.signal });
    } catch {
      failure = superseded ? "superseded" : timedOut ? "timeout" : "network";
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
    if (failure === "superseded") throw new RetryFetchError("superseded", attempt);
    const last = attempt === maxAttempts;
    if (response && (!retryableStatus(response.status) || last)) return response;
    if (!response && last) throw new RetryFetchError(failure ?? "network", attempt);
    options.onRetry?.(attempt, response ? response.status : (failure ?? "network"));
    await sleep(options.retryDelaysMs[attempt - 1] ?? 0, options.signal);
  }
  // Döngü her dalda döner ya da fırlatır; TypeScript için.
  throw new RetryFetchError("network", maxAttempts);
}
