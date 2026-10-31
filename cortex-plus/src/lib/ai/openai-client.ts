import OpenAI, { type ClientOptions } from "openai";

/**
 * Bütün OpenAI istemcileri buradan açılır (31 Ekim 2026, lansman zırhı).
 *
 * İki iş (aşağıda yedek model): sağlayıcı 429 ile "insufficient_quota" derse (hesabın kredisi bitti) kurucuya hemen haber gider. Kota
 * bitince her ders, test, sohbet ve okuma düşer; tek iz öğrencinin gördüğü hata olurdu (LAUNCH_READINESS: "429 no
 * credits remaining"). Cevabın gövdesi kopyadan okunur: SDK'nın gördüğü cevap değişmez, uyarı isteği beklemez.
 * Uyarı modülü yalnız o anda yüklenir (sunucuya özel bağımlılıkları sıradan çağrıya girmesin).
 */
export function openaiClient(options: ClientOptions = {}): OpenAI {
  return new OpenAI({ ...options, fetch: guardedFetch(options.fetch) });
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

/*
  Otomatik yedek model (31 Ekim 2026, Paket J2 #8, sınav gecesi koruması).

  Asıl model (luna) 429 (hız sınırı; kota bitti değil), 500, 502, 503, 504 ya da ağ kopmasıyla düşerse aynı istek bir kez
  yedek modelle (`OPENAI_FAILOVER_MODEL`, varsayılan gpt-4.1) yinelenir; öğrenci hata görmez. Yalnız metin üretimi
  uçlarında (chat/completions, responses): ses, gömme, resim ve denetim uçlarının kendi modelleri var. Yedek modelin
  bilmediği akıl yürütme alanları (reasoning_effort, reasoning, service_tier, verbosity) çıkarılır. Kota bitti 429'unda
  yedek de aynı hesaptan yer: geçilmez, kurucuya uyarı gider. SDK'nın kendi zaman aşımı isteği kestiyse (sinyal iptal)
  yedeğe geçilmez: çağıranın yeniden denemesi (`withTransientRetry`) işler. Kapatmak için `OPENAI_FAILOVER=off`.
  Kullanım kaydı çağıranın modeliyle yazılır; geçiş `openai_failover` günlüğünde görünür.
*/
const FAILOVER_STATUS = new Set([429, 500, 502, 503, 504]);
const FAILOVER_PATH = /\/(chat\/completions|responses)$/;
const PRIMARY_ONLY_FIELDS = ["reasoning_effort", "reasoning", "service_tier", "verbosity"];

export function failoverModel(env: Record<string, string | undefined> = process.env): string | null {
  if (/^(off|0|false|kapali|kapalı)$/i.test(env.OPENAI_FAILOVER?.trim() ?? "")) return null;
  return env.OPENAI_FAILOVER_MODEL?.trim() || "gpt-4.1";
}

/** Aynı isteğin yedek modelle gövdesi; geçilemiyorsa null. */
export function failoverInit(
  input: Parameters<FetchLike>[0],
  init: Parameters<FetchLike>[1],
  model: string | null = failoverModel(),
): RequestInit | null {
  if (!model) return null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!FAILOVER_PATH.test(path) || typeof init?.body !== "string") return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const current = typeof body.model === "string" ? body.model : "";
  if (!current || current === model || current.startsWith(`${model}-`)) return null;
  const next: Record<string, unknown> = { ...body, model };
  for (const field of PRIMARY_ONLY_FIELDS) delete next[field];
  const headers = new Headers(init.headers);
  headers.delete("content-length");
  return { ...init, headers, body: JSON.stringify(next) };
}

function modelOf(init: Parameters<FetchLike>[1]): string {
  try {
    return typeof init?.body === "string" ? String((JSON.parse(init.body) as { model?: unknown }).model ?? "") : "";
  } catch {
    return "";
  }
}

function guardedFetch(inner?: ClientOptions["fetch"]): FetchLike {
  return async (input, init) => {
    const call = inner ?? globalThis.fetch;
    let response: Response;
    try {
      response = await call(input, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      const retry = failoverInit(input, init);
      if (!retry) throw error;
      console.warn("openai_failover", { from: modelOf(init), to: failoverModel(), reason: "network" });
      return call(input, retry);
    }
    if (!FAILOVER_STATUS.has(response.status)) return response;
    let text = "";
    if (response.status === 429) {
      text = await response.clone().text().catch(() => "");
      if (isQuotaExhaustedText(text)) {
        void import("@/lib/ai/provider-quota")
          .then(({ noteProviderQuotaExhausted }) => noteProviderQuotaExhausted())
          .catch(() => undefined);
        return response;
      }
    }
    const retry = failoverInit(input, init);
    if (!retry || init?.signal?.aborted) return response;
    console.warn("openai_failover", { from: modelOf(init), to: failoverModel(), reason: response.status });
    try {
      const second = await call(input, retry);
      return second.ok ? second : response;
    } catch {
      return response;
    }
  };
}
