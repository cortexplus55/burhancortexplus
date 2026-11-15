/**
 * Faz 13 PR-1 (teacher.v2, PROMPT-V2 §7 "soru ayrı balon"): öğretmen cevabının sonundaki soru cümlesi ayrı bir kartta
 * çizilir; metin değişmez, yalnız yerleşim. Kutu (">"), formül ($$) ya da liste ile biten cevapta ayırma yok.
 */
export function splitFinalQuestion(body: string): { body: string; question: string } | null {
  const blocks = body.trimEnd().split(/\n{2,}/);
  const last = blocks[blocks.length - 1]?.trim() ?? "";
  if (!last || /^(?:>|\$\$|[-*•]\s|\d+[.)]\s)/.test(last)) return null;
  if (!/\?\s*(?:\*\*)?\s*$/u.test(last)) return null;
  const parts = last.split(/(?<=[.!?…])\s+/u);
  const question = parts[parts.length - 1]!.trim();
  if (question.length < 4) return null;
  const rest = parts.slice(0, -1).join(" ").trim();
  return {
    body: [...blocks.slice(0, -1), rest].filter((block) => block.trim()).join("\n\n"),
    question,
  };
}
