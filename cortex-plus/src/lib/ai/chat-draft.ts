import type OpenAI from "openai";

export type ChatDraft = { text: string; tokensIn: number; tokensOut: number };

/**
 * Sohbet taslağı (15 Kasım 2026, ürün sahibi: "60-80 sn kabul edilemez"). `onDelta` verilirse taslak akışla yazılır ve
 * her parça geldiği anda ekrana gider; denetim ve ekler arkada sürer, bitişte kesin metin taslağın yerine geçer
 * (`chat-live.ts`). Verilmezse bugünkü tek parça çağrı. Baştaki boşluk ekrana yazılmaz (cevap trim'li saklanır).
 */
export async function createChatDraft(
  client: OpenAI,
  body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options: { signal?: AbortSignal; timeout: number; onDelta?: (text: string) => void },
): Promise<ChatDraft> {
  if (!options.onDelta) {
    const response = await client.chat.completions.create(body, {
      signal: options.signal,
      timeout: options.timeout,
      maxRetries: 0,
    });
    return {
      text: response.choices[0]?.message?.content ?? "",
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    };
  }
  const stream = await client.chat.completions.create(
    { ...body, stream: true, stream_options: { include_usage: true } },
    { signal: options.signal, timeout: options.timeout, maxRetries: 0 },
  );
  let text = "";
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      const piece = text ? delta : delta.replace(/^\s+/, "");
      text += delta;
      if (piece) options.onDelta(piece);
    }
    if (chunk.usage) {
      tokensIn = chunk.usage.prompt_tokens ?? 0;
      tokensOut = chunk.usage.completion_tokens ?? 0;
    }
  }
  return { text, tokensIn, tokensOut };
}
