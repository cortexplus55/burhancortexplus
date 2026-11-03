/**
 * Havuz yazılı denemesi için soru seçimi (saf, 3 Kasım 2026). Her konu satırı kendi havuz ünitelerinden ve
 * kazanımlarından `count` doğrulanmış soru alır; aynı soru iki kez gelmez, öğrencinin görmediği sorular önce,
 * kazanımlar sırayla dengelenir. Bir satır bile dolmazsa null (çağıran bugünkü üretim yoluna düşer).
 */
export type PoolExamItem = {
  id: string;
  unit_id: string;
  outcome_id: string;
  difficulty: string | null;
  stem: string;
  choices: unknown[];
  answer: number;
  explanation: string | null;
};

export type PoolExamRow = {
  topicId: string | null;
  topicLabel: string;
  count: number;
  unitIds: readonly string[];
  outcomeIds: ReadonlySet<string> | null;
};

export function usablePoolItem(item: PoolExamItem): boolean {
  if (!item.stem?.trim() || !Array.isArray(item.choices)) return false;
  const choices = item.choices.map((c) => String(c ?? "").trim());
  if (choices.length < 2 || choices.some((c) => !c)) return false;
  if (new Set(choices).size !== choices.length) return false;
  return Number.isInteger(item.answer) && item.answer >= 0 && item.answer < choices.length;
}

export function pickPoolExamItems(
  items: readonly PoolExamItem[],
  rows: readonly PoolExamRow[],
  seen: ReadonlySet<string>,
  random: () => number = Math.random,
): Array<{ row: PoolExamRow; items: PoolExamItem[] }> | null {
  const used = new Set<string>();
  const out: Array<{ row: PoolExamRow; items: PoolExamItem[] }> = [];
  for (const row of rows) {
    if (row.count <= 0) continue;
    const units = new Set(row.unitIds);
    const candidates = items.filter((item) => units.has(item.unit_id) && !used.has(item.id) && usablePoolItem(item));
    const inScope = row.outcomeIds ? candidates.filter((item) => row.outcomeIds!.has(item.outcome_id)) : candidates;
    const base = inScope.length >= row.count ? inScope : candidates;
    if (base.length < row.count) return null;
    const shuffled = base
      .map((item) => ({ item, key: (seen.has(item.id) ? 1 : 0) + random() * 0.5 }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.item);
    const fresh = shuffled.filter((item) => !seen.has(item.id));
    const ordered = fresh.length >= row.count ? fresh : shuffled;
    const byOutcome = new Map<string, PoolExamItem[]>();
    for (const item of ordered) byOutcome.set(item.outcome_id, [...(byOutcome.get(item.outcome_id) ?? []), item]);
    const picked: PoolExamItem[] = [];
    while (picked.length < row.count && [...byOutcome.values()].some((list) => list.length)) {
      for (const list of byOutcome.values()) if (list.length && picked.length < row.count) picked.push(list.shift()!);
    }
    for (const item of picked) used.add(item.id);
    out.push({ row, items: picked });
  }
  return out.length ? out : null;
}
