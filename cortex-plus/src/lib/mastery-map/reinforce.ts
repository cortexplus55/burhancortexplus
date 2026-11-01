/**
 * Ünite sonu pekiştirme (Plan PR 4). Saf; yalnız havuzdaki doğrulanmış sorulardan seçer, hiç soru üretmez.
 * Zayıf kazanım (en az 1 yanıt, ustalık < 0,5) başına en çok 2 soru: aynı outcome_id, daha önce yanıtlanmamış;
 * önce kolay/orta, yalnız onlar bitince zor. Hazır soru yoksa kazanım `missing` listesine girer.
 */
import type { Difficulty, MasteryState } from "@/lib/level-check/mastery";
import { isWeakOutcome } from "@/lib/mastery-map/plan";

export const REINFORCE_PER_OUTCOME = 2;
const DIFF_RANK: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 1 };

export type ReinforceItem = { id: string; outcomeId: string; difficulty: Difficulty };

export function pickReinforcement(
  outcomes: readonly { outcomeId: string; state: MasteryState }[],
  items: readonly ReinforceItem[],
  answered: ReadonlySet<string>,
  perOutcome = REINFORCE_PER_OUTCOME,
): { picked: ReinforceItem[]; weak: string[]; missing: string[] } {
  const weak = outcomes.filter((o) => isWeakOutcome(o.state)).map((o) => o.outcomeId);
  const picked: ReinforceItem[] = [];
  const missing: string[] = [];
  for (const outcomeId of weak) {
    const pool = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.outcomeId === outcomeId && !answered.has(item.id))
      .sort((a, b) => DIFF_RANK[a.item.difficulty] - DIFF_RANK[b.item.difficulty] || a.idx - b.idx)
      .slice(0, perOutcome)
      .map(({ item }) => item);
    if (!pool.length) missing.push(outcomeId);
    picked.push(...pool);
  }
  return { picked, weak, missing };
}
