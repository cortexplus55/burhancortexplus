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

/** Net yalnız bu hazırlığın kendi yanıtlarından; veri yoksa no_data (+ "diğer hazırlıklarından" sayısı). */
export async function prepNetEstimate(
  service: import("@supabase/supabase-js").SupabaseClient,
  input: { userId: string; prepId: string; prefs: unknown; mapUnits: MapUnitInput[] },
): Promise<NetEstimate> {
  const { prepScopedUnits } = await import("@/lib/mastery-map/load");
  const scoped = await prepScopedUnits(service, input).catch(() => null);
  if (!scoped) return { status: "no_data", responses: 0 };
  const net = netEstimateFor(input.prefs, scoped.units);
  return net.status === "no_data" && scoped.carried > 0 ? { ...net, carried: scoped.carried } : net;
}

/**
 * /ilerleme için net kartı: hub'daki aynı hesap. Önce verilen hazırlık (sayfanın "en yakın sınav" kartı); o hazırlıkta
 * resmî plan (Hakimiyet Haritası) yoksa resmî planı olan en yeni hazırlık. 3 Kasım 2026 kök neden: en yakın sınav
 * belgeli (plansız) bir hazırlıktı → harita girdisi boş → kart hiç çizilmiyordu; ayrıca `exam_preps.updated_at`
 * sütunu yok (sıralama sorgusu hata verip null dönüyordu) → sıralama created_at ile.
 */
export async function loadPrepNet(
  service: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  prepId: string | null,
): Promise<{ prepId: string; title: string; net: NetEstimate } | null> {
  type Row = { id: string; title: string | null; learning_preferences: unknown };
  const base = () => service.from("exam_preps").select("id, title, learning_preferences").eq("user_id", userId);
  const { loadMapInputs, plannedPoolUnits } = await import("@/lib/mastery-map/load");
  const candidates: Row[] = [];
  if (prepId) {
    const { data } = await base().eq("id", prepId).maybeSingle();
    if (data) candidates.push(data as Row);
  }
  if (!candidates.some((p) => plannedPoolUnits(p.learning_preferences).length)) {
    const { data } = await base()
      .not("learning_preferences->officialPlan->units", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    for (const r of (data ?? []) as Row[]) if (!candidates.some((c) => c.id === r.id)) candidates.push(r);
  }
  for (const prep of candidates) {
    if (!plannedPoolUnits(prep.learning_preferences).length) continue;
    const mapUnits = await loadMapInputs(service, { userId, prefs: prep.learning_preferences });
    if (!mapUnits?.length) continue;
    return { prepId: prep.id, title: prep.title ?? "Hazırlık", net: await prepNetEstimate(service, { userId, prepId: prep.id, prefs: prep.learning_preferences, mapUnits }) };
  }
  return null;
}
