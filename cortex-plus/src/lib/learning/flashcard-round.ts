/**
 * Kartlarda tekrar turu: ilk turda hiç bilinmeyen kartlar destenin sonunda bir kez daha gelir.
 *
 * İlk tur cevabı kayıtta kalır. Tekrar turu skoru yükseltmez: ekrandaki yüzde de ilk turun
 * ağırlıklı kredisidir. "Zorlandım" kısmi kredidir, tam puan değildir.
 */

/**
 * Kart cevabının kredisi. Bildim (5) ve eski "true" tam, Zorlandım (3) 0,6, eski "hatırladım" (4) 0,8,
 * Bilemedim (1) ve eski "false" 0. Boş cevap yok sayılır.
 */
export function cardAnswerCredit(answer: unknown): number | null {
  if (answer == null || answer === "") return null;
  if (answer === true || answer === "true") return 1;
  if (answer === false || answer === "false") return 0;
  const quality =
    typeof answer === "number"
      ? answer
      : typeof answer === "string" && /^[1-5]$/.test(answer)
        ? Number(answer)
        : Number.NaN;
  if (!Number.isFinite(quality)) return null;
  if (quality >= 5) return 1;
  if (quality === 4) return 0.8;
  if (quality === 3) return 0.6;
  return 0;
}

export function cardWasMissed(answer: unknown): boolean {
  return cardAnswerCredit(answer) === 0;
}

/** İlk turun ağırlıklı kredisi, onda bir basamağa yuvarlanır. Tekrar turu eklenmez. */
export function cardDeckCredit(answers: Record<string, unknown>, count: number): number {
  let sum = 0;
  for (let index = 0; index < count; index += 1) sum += cardAnswerCredit(answers[String(index)]) ?? 0;
  return Math.round(sum * 10) / 10;
}

function said(answers: Record<string, unknown>, index: number, value: boolean): boolean {
  const answer = answers[String(index)];
  return answer === value || answer === String(value);
}

/** İlk turda hiç bilinmeyen kartların sırası. Zorlandım (kısmi kredi) buraya girmez. */
export function missedCards(answers: Record<string, unknown>, count: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (cardWasMissed(answers[String(index)])) out.push(index);
  }
  return out;
}

/** İlk turda bilinenler + tekrar turunda bilinenler. */
export function knownCardCount(
  answers: Record<string, unknown>,
  count: number,
  recovered: number[],
): number {
  const known = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    if (said(answers, index, true)) known.add(index);
  }
  for (const index of recovered) {
    if (index >= 0 && index < count && said(answers, index, false)) known.add(index);
  }
  return known.size;
}

export function repeatedCardsLine(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 kart ilk turda bilinmedi; tekrar turunda bir kez daha gördün."
    : `${count} kart ilk turda bilinmedi; tekrar turunda bir kez daha gördün.`;
}
