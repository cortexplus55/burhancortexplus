/**
 * Kartlarda tekrar turu (Astra, 1 Ekim 2026): ilk turda "Hayır" denen kartlar
 * destenin sonunda bir kez daha gelir.
 *
 * İlk tur cevabı kayıtta kalır — aralıklı tekrar ve "Yanlışlar ve tekrarlar"
 * o cevaba bakıyor. Tekrar turu yalnızca ekrandaki "Bildiğin kartlar"
 * sayısını değiştirir; kayda yazılmaz.
 */

function said(answers: Record<string, unknown>, index: number, value: boolean): boolean {
  const answer = answers[String(index)];
  return answer === value || answer === String(value);
}

/** İlk turda "Hayır" denen kartların sırası. */
export function missedCards(answers: Record<string, unknown>, count: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (said(answers, index, false)) out.push(index);
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
