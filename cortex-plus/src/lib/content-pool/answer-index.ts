/**
 * Havuz sorusu cevabı → item_bank şık sırası (3 Kasım 2026). Yazılı deneme ve konu testi cevabı şık METNİ taşır;
 * Hakimiyet Haritası (item_responses.chosen + outcome_mastery) şık sırasını ister. Saf işlev: test edilir.
 */
export type PoolAnswer = { poolItemId: string; chosenText: string | null; correct: boolean };
export type PoolItemChoices = { id: string; choices: unknown };

function norm(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
}

/** Seçilen şıkkın yeri; boş ya da eşleşmeyen cevapta null (yanıt yazılmaz, uydurulmaz). */
export function chosenIndex(choices: unknown, chosenText: string | null | undefined): number | null {
  if (!Array.isArray(choices) || !chosenText?.trim()) return null;
  const target = norm(chosenText);
  const index = choices.findIndex((choice) => norm(String(choice ?? "")) === target);
  return index >= 0 && index <= 9 ? index : null;
}

/** Yazılacak satırlar: bilinen havuz sorusu + boş olmayan, şıkka eşleşen cevap. */
export function poolResponsePlan(
  items: readonly PoolItemChoices[],
  answers: readonly PoolAnswer[],
): { poolItemId: string; chosen: number; correct: boolean }[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const out: { poolItemId: string; chosen: number; correct: boolean }[] = [];
  for (const answer of answers) {
    const item = byId.get(answer.poolItemId);
    if (!item || seen.has(answer.poolItemId)) continue;
    const chosen = chosenIndex(item.choices, answer.chosenText);
    if (chosen === null) continue;
    seen.add(answer.poolItemId);
    out.push({ poolItemId: answer.poolItemId, chosen, correct: answer.correct });
  }
  return out;
}
