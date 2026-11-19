import { answerKey } from "@/lib/learning/exam-quiz";

/**
 * "🤔 İki Şık Arasında Kaldım" ile bir çeldirici eleme (Faz 5 §3.1, 19 Kasım 2026). Öğrencinin arasında kaldığı iki
 * şıkkın DIŞINDAN, doğru olmayan bir şık elenir: seçim daralır ama cevap ele verilmez (iki şıktan biri elenseydi kalan
 * doğru cevap olurdu). Çok cevaplı soruda ya da dışarıda çeldirici kalmadıysa eleme yok (`null`).
 * Seçim belirleyicidir (aynı soru aynı şıkkı eler): sorunun metninden küçük bir özet, adayların arasından birini seçer.
 */
export function eliminateDistractor(input: {
  text: string;
  options: readonly string[];
  correct: readonly string[];
  pair: readonly string[];
  multi?: boolean;
}): string | null {
  if (input.multi) return null;
  const right = new Set(input.correct.map(answerKey));
  const chosen = new Set(input.pair.map(answerKey));
  if (!right.size) return null;
  const candidates = input.options.filter((option) => !right.has(answerKey(option)) && !chosen.has(answerKey(option)));
  if (!candidates.length) return null;
  let hash = 0;
  for (const char of input.text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return candidates[hash % candidates.length] ?? null;
}
