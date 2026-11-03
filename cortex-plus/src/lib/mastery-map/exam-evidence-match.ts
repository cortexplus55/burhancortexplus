/**
 * Havuz dışı soru → resmî kazanım eşlemesi (saf, model çağrısı yok). Soru metni ile kazanım metninin anlamlı
 * sözcük örtüşmesi; tek açık kazanan varsa o kazanım tam ağırlıkla, yoksa ünitenin kazanımlarına eşit pay.
 */
export type MatchOutcome = { outcomeId: string; text: string };
export type OutcomeMatch = { outcomeIds: string[]; weight: number; kind: "text" | "unit_spread" };

const STOP = new Set(
  "ve ile bir bu şu o da de ki mi mı mu mü için gibi olan olarak hangi hangisi hangileri aşağıdaki aşağıdakilerden nedir neden nasıl kadar daha en çok az ya veya ise ilgili ilişkili dönem dönemi dönemin yılı yıl".split(" "),
);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLocaleLowerCase("tr-TR").split(/[^a-zçğıöşüâîû0-9]+/u)) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    out.add(raw.slice(0, 6)); // kaba Türkçe kök: ek farkları eşleşsin
  }
  return out;
}

export function matchOutcome(questionText: string, outcomes: MatchOutcome[]): OutcomeMatch | null {
  if (!outcomes.length) return null;
  const q = tokens(questionText);
  const scored = outcomes.map((o) => {
    let hit = 0;
    for (const t of tokens(o.text)) if (q.has(t)) hit += 1;
    return { id: o.outcomeId, hit };
  });
  const best = Math.max(...scored.map((s) => s.hit));
  const winners = scored.filter((s) => s.hit === best);
  if (best > 0 && winners.length === 1) return { outcomeIds: [winners[0]!.id], weight: 1, kind: "text" };
  const ids = outcomes.map((o) => o.outcomeId);
  return { outcomeIds: ids, weight: Math.round((1 / ids.length) * 1000) / 1000, kind: "unit_spread" };
}
