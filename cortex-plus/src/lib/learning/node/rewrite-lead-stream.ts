/**
 * Belgesiz "Farklı anlat" giriş akışını açar (3 Kasım 2026, #552 sonrası canlı ölçüm: tık → ilk metin ≈4,4 sn).
 * Giriş çağrısı yalnız konu adı + kazanım özeti ister; kredi ayırma ve kayıt açma beklenmeden başlatılabilir.
 * Ayırma düşerse `abort()` çağrılır (kısa çağrı, yayım yok). Moderasyon değişmez: istemde öğrenci metni yok.
 */
import "server-only";
import { samplingParams } from "@/lib/ai/model-params";
import { openaiClient } from "@/lib/ai/openai-client";
import { env } from "@/lib/env";
import { REWRITE_LEAD_STREAM_MAX_TOKENS, rewriteLeadStreamPrompt } from "@/lib/learning/rewrite-lead";

type LeadChunk = { usage?: { prompt_tokens?: number; completion_tokens?: number } | null; choices: Array<{ delta?: { content?: string | null } }> };

export type RewriteLeadStream = {
  model: string;
  /** İstek başından giriş çağrısının açıldığı an (ms). */
  startedMs: number;
  stream: Promise<AsyncIterable<LeadChunk>>;
  abort: () => void;
};

export function openRewriteLeadStream(input: { topicLabel: string; basis: string; requestStarted: number }): RewriteLeadStream {
  const prompt = rewriteLeadStreamPrompt({ topicLabel: input.topicLabel, basis: input.basis });
  const model = env.OPENAI_STANDARD_MODEL;
  const controller = new AbortController();
  const stream = openaiClient({ apiKey: env.OPENAI_API_KEY! }).chat.completions.create(
    {
      model,
      ...samplingParams(model, { temperature: 0.7, maxTokens: REWRITE_LEAD_STREAM_MAX_TOKENS }),
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
    },
    { timeout: 8_000, maxRetries: 0, signal: controller.signal },
  ) as unknown as Promise<AsyncIterable<LeadChunk>>;
  // Tüketilmeden düşerse (ayırma reddi) işlenmemiş ret kalmasın.
  stream.catch(() => undefined);
  return { model, startedMs: Date.now() - input.requestStarted, stream, abort: () => controller.abort() };
}
