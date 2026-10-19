/**
 * İçerik isteği düşünce bir kez kendiliğinden yeniden dene (19 Ekim 2026, ürün sahibi:
 * "kullanıcı istediyse üretilsin; 'üretilemedi / oluşturulamadı' gibi uyarılar olmasın").
 *
 * Sunucu motorları zaten kendi içinde ikinci taslak yazıyor; bu katman sağlayıcı ya da ağ
 * kaynaklı tek seferlik düşüşleri öğrenciye göstermeden yeniden ister. Hak, paket, kaynak-yok,
 * hız sınırı ve "üretim hâlâ sürüyor" cevapları yeniden denenmez: ya hiçbir şeyi değiştirmez ya
 * da ikinci bir üretim başlatır.
 */
export const AUTO_RETRY_CODES = new Set([
  "generation_failed",
  "content_verification_failed",
  "invalid_ai_response",
  "podcast_script_rejected",
]);
export const AUTO_RETRY_DELAY_MS = 1_500;

/**
 * Üretim yuvaları dolu (Faz 3.2, `generation-slots.ts`): sunucu her istekte 25 sn'ye kadar yer
 * bekliyor; ekran bundan sonra da birkaç kez yeniden sorar (toplam ~3 dk) ve bu sürede
 * hazırlanıyor ekranında `BUSY_NOTE` görünür. Hak ya da para düşmez: kredi yuva alındıktan sonra ayrılır.
 */
export const BUSY_CODE = "generation_busy";
export const BUSY_RETRY_DELAY_MS = 3_000;
export const BUSY_MAX_RETRIES = 6;
export const BUSY_NOTE = "Şu an yoğunluk var; sıradasın, birazdan başlıyor.";

export function isBusy(status: number, code: unknown): boolean {
  return status === 503 && code === BUSY_CODE;
}

/** 5xx ve kodu ya yok ya da üretim düşüşü olan cevap. */
export function isRetryableFailure(status: number, code: unknown): boolean {
  if (status < 500) return false;
  if (code == null || code === "") return true;
  return typeof code === "string" && AUTO_RETRY_CODES.has(code);
}

/**
 * POST + JSON; üretim düşüşünde bir kez daha. `body` her denemede yeniden kurulur — istek
 * kimliği taşıyan uçlar yeni kimlikle denesin (aynı kimlik "işlem tamamlandı" döner).
 * Ağ hatası fırlatılır: bağlantı koptuysa sunucu hâlâ yazıyor olabilir, çağıran karar verir.
 */
export async function postJsonWithRetry<T extends Record<string, unknown> = Record<string, unknown>>(
  url: string,
  body: () => unknown,
  options: { delayMs?: number; busyDelayMs?: number; busyRetries?: number; onBusy?: () => void } = {},
): Promise<{ res: Response; data: T; retried: boolean }> {
  const once = async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body()),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { res, data };
  };
  let first = await once();
  // Yuvalar dolu: hata değil, sıra. Birkaç saniyede bir yeniden sorulur (sunucu ayrıca bekliyor).
  for (let tries = 0; isBusy(first.res.status, first.data.code) && tries < (options.busyRetries ?? BUSY_MAX_RETRIES); tries += 1) {
    options.onBusy?.();
    await new Promise((resolve) => setTimeout(resolve, options.busyDelayMs ?? BUSY_RETRY_DELAY_MS));
    first = await once();
  }
  if (first.res.ok || !isRetryableFailure(first.res.status, first.data.code ?? first.data.error)) {
    return { ...first, retried: false };
  }
  await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? AUTO_RETRY_DELAY_MS));
  const second = await once();
  return { ...second, retried: true };
}
