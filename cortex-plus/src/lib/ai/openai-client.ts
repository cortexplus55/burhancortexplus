import OpenAI, { type ClientOptions } from "openai";

/**
 * Bütün OpenAI istemcileri buradan açılır (31 Ekim 2026, lansman zırhı).
 *
 * Tek fark: sağlayıcı 429 ile "insufficient_quota" derse (hesabın kredisi bitti) kurucuya hemen haber gider. Kota
 * bitince her ders, test, sohbet ve okuma düşer; tek iz öğrencinin gördüğü hata olurdu (LAUNCH_READINESS: "429 no
 * credits remaining"). Cevabın gövdesi kopyadan okunur: SDK'nın gördüğü cevap değişmez, uyarı isteği beklemez.
 * Uyarı modülü yalnız o anda yüklenir (sunucuya özel bağımlılıkları sıradan çağrıya girmesin).
 */
export function openaiClient(options: ClientOptions = {}): OpenAI {
  return new OpenAI({ ...options, fetch: watchQuota(options.fetch) });
}

/** Sağlayıcının "kredin bitti" cevabı: hız sınırı (geçici 429) değil. */
export function isQuotaExhaustedText(body: string): boolean {
  return /insufficient_quota|exceeded your current quota|no credits remaining/i.test(body);
}

/** SDK hata nesnesinde aynı ayrım (`code` alanı ya da ileti). */
export function isQuotaExhaustedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 429) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "insufficient_quota") return true;
  const message = error instanceof Error ? error.message : "";
  return isQuotaExhaustedText(message);
}

type FetchLike = NonNullable<ClientOptions["fetch"]>;

function watchQuota(inner?: ClientOptions["fetch"]): FetchLike {
  return async (input, init) => {
    const response = await (inner ?? globalThis.fetch)(input, init);
    if (response.status === 429) {
      void response
        .clone()
        .text()
        .then(async (body) => {
          if (!isQuotaExhaustedText(body)) return;
          const { noteProviderQuotaExhausted } = await import("@/lib/ai/provider-quota");
          await noteProviderQuotaExhausted();
        })
        .catch(() => undefined);
    }
    return response;
  };
}
