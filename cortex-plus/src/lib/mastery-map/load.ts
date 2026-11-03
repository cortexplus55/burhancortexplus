import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnit, type PoolOutcome } from "@/lib/content-pool/keys";
import { PRIOR, type MasteryState, type ScanRating } from "@/lib/level-check/mastery";
import { poolIdFromSetupId } from "@/lib/level-check/select";
import { levelUnitTitle } from "@/lib/level-check/titles";
import { loadVerifiedItems, toPick } from "@/lib/level-check/store";
import type { MapUnitInput } from "@/lib/mastery-map/plan";
import { pickReinforcement, type ReinforceItem } from "@/lib/mastery-map/reinforce";

type PlannedUnit = { topic?: string; unitId?: string; codes?: string[]; rating?: ScanRating | null; ratingSource?: "self" | "scan" | null };

/** Resmî kurulumdaki ünite → havuz ünitesi + seçilen kazanımlar (kodla). Kurulum dışı hazırlıkta boş. */
export function plannedPoolUnits(prefs: unknown): { poolId: string; order: number; outcomes: PoolOutcome[]; selfRating: ScanRating | null; title: string }[] {
  const units = (prefs as { officialPlan?: { units?: PlannedUnit[] } } | null)?.officialPlan?.units;
  if (!Array.isArray(units)) return [];
  const out: ReturnType<typeof plannedPoolUnits> = [];
  units.forEach((u, order) => {
    const poolId = u?.unitId ? poolIdFromSetupId(u.unitId) : null;
    const unit = poolId ? poolUnit(poolId) : null;
    if (!poolId || !unit || out.some((x) => x.poolId === poolId)) return;
    const codes = new Set(Array.isArray(u.codes) ? u.codes : []);
    const chosen = unit.outcomes.filter((o) => codes.has(o.code));
    const selfRating = u.ratingSource === "scan" ? null : (u.rating ?? null);
    out.push({ poolId, order, outcomes: chosen.length ? chosen : unit.outcomes, selfRating, title: levelUnitTitle(poolId) ?? unit.unit.title });
  });
  return out;
}

export async function loadMasteryStates(service: SupabaseClient, userId: string, outcomeIds: string[]): Promise<Map<string, MasteryState> | null> {
  const states = new Map<string, MasteryState>();
  if (!outcomeIds.length) return states;
  const { data, error } = await service.from("outcome_mastery").select("outcome_id, alpha, beta, n").eq("user_id", userId).in("outcome_id", outcomeIds);
  if (error) return null;
  for (const r of data ?? []) states.set(String(r.outcome_id), { alpha: Number(r.alpha), beta: Number(r.beta), n: Number(r.n) });
  return states;
}

/** Öğrencinin bu ünitelerde daha önce yanıtladığı soru kimlikleri (pekiştirmede tekrar sorulmaz). */
export async function loadAnsweredItems(service: SupabaseClient, userId: string, unitIds: string[]): Promise<Set<string>> {
  if (!unitIds.length) return new Set();
  const { data } = await service.from("item_responses").select("item_id").eq("user_id", userId).in("unit_id", unitIds).limit(5000);
  return new Set((data ?? []).map((r) => String(r.item_id)));
}

/** Hakimiyet haritası girdisi; resmî kurulumdan değilse ya da tablolar yoksa null. */
export async function loadMapInputs(service: SupabaseClient, input: { userId: string; prefs: unknown }): Promise<MapUnitInput[] | null> {
  try {
    const planned = plannedPoolUnits(input.prefs);
    if (!planned.length) return null;
    const states = await loadMasteryStates(service, input.userId, planned.flatMap((p) => p.outcomes.map((o) => o.outcomeId)));
    if (!states) return null;
    const unitIds = planned.map((p) => p.poolId);
    const [answered, rows] = await Promise.all([loadAnsweredItems(service, input.userId, unitIds), loadVerifiedItems(service, unitIds)]);
    const items: ReinforceItem[] = rows.map(toPick);
    // Kazanım başına şu an sunulabilecek ek soru (pekiştirme rotasıyla aynı seçim): öneri ve çip gerçek sayıyı gösterir.
    const extra = new Map<string, number>();
    for (const p of planned) {
      const r = pickReinforcement(p.outcomes.map((o) => ({ outcomeId: o.outcomeId, state: states.get(o.outcomeId) ?? PRIOR, extra: extra.get(o.outcomeId) ?? 0 })), items, answered);
      for (const i of r.picked) extra.set(i.outcomeId, (extra.get(i.outcomeId) ?? 0) + 1);
    }
    return planned.map((p) => ({
      unitId: p.poolId,
      title: p.title,
      order: p.order,
      selfRating: p.selfRating,
      outcomes: p.outcomes.map((o) => ({ outcomeId: o.outcomeId, code: o.code, text: o.text, state: states.get(o.outcomeId) ?? PRIOR })),
    }));
  } catch {
    return null;
  }
}

/** Bir hazırlığın kendi kanıtından kazanım durumu: yalnız `prep_id` = bu hazırlık olan yanıtlar ve deneme kanıtı. */
export function prepScopedStates(
  responses: { outcome_id: unknown; correct: unknown }[],
  evidence: { outcome_ids: unknown; weight: unknown; correct: unknown }[],
): Map<string, MasteryState> {
  const states = new Map<string, MasteryState>();
  const add = (outcomeId: string, correct: boolean, weight: number) => {
    const s = states.get(outcomeId) ?? { alpha: PRIOR.alpha, beta: PRIOR.beta, n: 0 };
    states.set(outcomeId, { alpha: s.alpha + (correct ? weight : 0), beta: s.beta + (correct ? 0 : weight), n: s.n + 1 });
  };
  for (const r of responses) add(String(r.outcome_id), r.correct === true, 1);
  for (const e of evidence) {
    const w = Number(e.weight);
    if (!Array.isArray(e.outcome_ids) || !(w > 0)) continue;
    for (const id of e.outcome_ids) add(String(id), e.correct === true, w);
  }
  return states;
}

/**
 * Net kartı yalnız bu hazırlığın verisiyle (3 Kasım 2026 kök neden: `outcome_mastery` kullanıcı düzeyinde, başka
 * hazırlıklardaki yanıtlar yeni hazırlığın netine taşınıyordu). `carried`: kullanıcı düzeyinde olup bu hazırlığa ait
 * olmayan yanıt sayısı (kartta "diğer hazırlıklarından" notu).
 */
export async function prepScopedUnits(
  service: SupabaseClient,
  input: { userId: string; prepId: string; mapUnits: MapUnitInput[] },
): Promise<{ units: MapUnitInput[]; carried: number }> {
  const ids = input.mapUnits.flatMap((u) => u.outcomes.map((o) => o.outcomeId));
  const [resp, ev] = await Promise.all([
    service.from("item_responses").select("outcome_id, correct").eq("user_id", input.userId).eq("prep_id", input.prepId).in("outcome_id", ids).limit(5000),
    service.from("exam_answer_evidence").select("outcome_ids, weight, correct").eq("user_id", input.userId).eq("prep_id", input.prepId).limit(5000),
  ]);
  const states = prepScopedStates(resp.error ? [] : (resp.data ?? []), ev.error ? [] : (ev.data ?? []));
  let carried = 0;
  const units = input.mapUnits.map((u) => ({
    ...u,
    outcomes: u.outcomes.map((o) => {
      const own = states.get(o.outcomeId) ?? { ...PRIOR, n: 0 };
      carried += Math.max(0, o.state.n - own.n);
      return { ...o, state: own };
    }),
  }));
  return { units, carried };
}
