import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnit, type PoolOutcome } from "@/lib/content-pool/keys";
import { PRIOR, type MasteryState, type ScanRating } from "@/lib/level-check/mastery";
import { poolIdFromSetupId } from "@/lib/level-check/select";
import { levelUnitTitle } from "@/lib/level-check/titles";
import type { MapUnitInput } from "@/lib/mastery-map/plan";

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

/** Hakimiyet haritası girdisi; resmî kurulumdan değilse ya da tablolar yoksa null. */
export async function loadMapInputs(service: SupabaseClient, input: { userId: string; prefs: unknown }): Promise<MapUnitInput[] | null> {
  try {
    const planned = plannedPoolUnits(input.prefs);
    if (!planned.length) return null;
    const states = await loadMasteryStates(service, input.userId, planned.flatMap((p) => p.outcomes.map((o) => o.outcomeId)));
    if (!states) return null;
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
