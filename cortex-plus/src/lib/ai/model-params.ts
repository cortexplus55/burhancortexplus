/**
 * GPT-5 ve sonrası (gpt-6-luna dahil) ile o-serisi akıl yürüten modeller
 * Chat Completions'ta `temperature`'ı yalnız varsayılanda, `max_tokens`'ı hiç
 * kabul etmiyor; onun yerine `max_completion_tokens` istiyor ve bu sınır
 * akıl yürütme jetonlarını da sayıyor. Eski parametreyi doğrudan geçmek
 * çağrıyı 400 ile düşürür; küçük bir sınır (başlık için 40) ise cevabı boş
 * bırakır. Model değişse de çağrı yerleri değişmesin diye tek yerde.
 */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/i.test(model.trim());
}

/** Akıl yürütme jetonlarına yer kalsın diye en az bu kadar. */
const REASONING_MIN_BUDGET = 2000;

export function samplingParams(
  model: string,
  input: { temperature?: number; maxTokens?: number },
): { temperature?: number; max_tokens?: number; max_completion_tokens?: number } {
  if (isReasoningModel(model)) {
    return input.maxTokens != null
      ? { max_completion_tokens: Math.max(REASONING_MIN_BUDGET, input.maxTokens * 8) }
      : {};
  }
  return {
    ...(input.temperature != null ? { temperature: input.temperature } : {}),
    ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
  };
}
