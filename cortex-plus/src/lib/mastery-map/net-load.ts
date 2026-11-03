import "server-only";
import { subjectForPlannedUnit } from "@/lib/curriculum/official-setup";
import { isSetupExam } from "@/lib/curriculum/yks-alan";
import { poolIdFromSetupId } from "@/lib/level-check/select";
import type { MapUnitInput } from "@/lib/mastery-map/plan";
import { estimateGainOnly, estimateNet, type NetEstimate, type NetSubject, type NetUnit } from "@/lib/mastery-map/net";

type PrefUnit = { unitId?: string; programId?: string; part?: string | null };

const asNetUnits = (mapUnits: MapUnitInput[]): NetUnit[] =>
  mapUnits.map((u) => ({ unitId: u.unitId, title: u.title, subjectKey: "", outcomes: u.outcomes.map((o) => ({ state: o.state })) }));

/**
 * Hakimiyet haritası girdisinden tahmini net. Kart her zaman çizilir (3 Kasım 2026): resmî ders soru sayısı
 * yoksa (ör. KPSS alt dersleri) net uydurulmaz, "no_count" ile yalnız +3 konu; az veride "no_data".
 */
export function netEstimateFor(prefs: unknown, mapUnits: MapUnitInput[]): NetEstimate {
  return officialNet(prefs, mapUnits) ?? estimateGainOnly(asNetUnits(mapUnits));
}

function officialNet(prefs: unknown, mapUnits: MapUnitInput[]): NetEstimate | null {
  const plan = (prefs as { officialPlan?: { exam?: unknown; units?: PrefUnit[] } } | null)?.officialPlan;
  if (!plan || !isSetupExam(plan.exam) || !Array.isArray(plan.units)) return null;
  const exam = plan.exam;
  const subjects = new Map<string, NetSubject>();
  const subjectOf = new Map<string, string>();
  for (const u of plan.units) {
    const poolId = u?.unitId ? poolIdFromSetupId(u.unitId) : null;
    if (!poolId || !u.programId) continue;
    const s = subjectForPlannedUnit(exam, u.programId, u.part ?? null);
    if (!s) continue;
    subjects.set(s.key, s);
    subjectOf.set(poolId, s.key);
  }
  const units: NetUnit[] = mapUnits
    .filter((u) => subjectOf.has(u.unitId))
    .map((u) => ({ unitId: u.unitId, title: u.title, subjectKey: subjectOf.get(u.unitId)!, outcomes: u.outcomes.map((o) => ({ state: o.state })) }));
  if (!units.length) return null;
  const est = estimateNet(units, [...subjects.values()]);
  return est.status === "no_data" && est.responses >= 3 ? null : est;
}

/**
 * /ilerleme için net kartı: verilen hazırlık (yoksa son güncellenen) için hub'daki aynı hesap.
 * Hazırlık ya da harita girdisi yoksa null (kart çizilmez); veri azsa NetCard "Henüz yeterli veri yok" der.
 */
export async function loadPrepNet(
  service: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  prepId: string | null,
): Promise<{ prepId: string; title: string; net: NetEstimate } | null> {
  const base = () => service.from("exam_preps").select("id, title, learning_preferences").eq("user_id", userId);
  const { data: prep } = prepId
    ? await base().eq("id", prepId).maybeSingle()
    : await base().order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!prep?.id) return null;
  const { loadMapInputs } = await import("@/lib/mastery-map/load");
  const mapUnits = await loadMapInputs(service, { userId, prefs: prep.learning_preferences });
  if (!mapUnits?.length) return null;
  return { prepId: prep.id as string, title: (prep.title as string) ?? "Hazırlık", net: netEstimateFor(prep.learning_preferences, mapUnits) };
}
