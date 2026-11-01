/**
 * Hakimiyet Haritası + Kişisel Program (Plan PR 4). Saf ve deterministik; model çağrısı yok, istemcide de çalışır.
 *
 * Girdi: hazırlığın resmî üniteleri (kazanımlar + outcome_mastery α, β, n) ve öğrencinin Biliyorum/Orta/Zayıf işareti.
 * - Ünite ustalığı: kazanım kanıtları toplanır, ön dağılım bir kez sayılır: α = 1 + Σ(αᵢ − 1), β = 1 + Σ(βᵢ − 1), n = Σnᵢ.
 * - Seviye: öğrencinin kendi işareti kazanır; yoksa ünite ustalığından `scanRating`; veri yoksa bilinmiyor.
 * - Ünite ağırlığı: resmî kazanım sayısı (soru payı iddiası değil; bkz. level-check/select.ts).
 * - Gereken süre (tahmin): kazanım başına `MINUTES_PER_OUTCOME` × seviye çarpanı (Zayıf 1,5 · Orta/bilinmiyor 1 · Biliyorum 0,4).
 * - Sıra: Zayıf üniteler önce, sonra ağırlığı yüksek olan; eşitlikte hazırlıktaki sıra.
 * - Kapasite = kalan gün × günlük dakika. Üniteler öncelik sırasıyla denenir: sığan plana girer, sığmayan
 *   "Zaman kalırsa" listesine gider (sonraki küçük ünite kalan boşluğa girebilir; plan içi sıra öncelik sırasıdır).
 */
import { CONFIDENT_MIN_N, masteryLabel, masteryValue, PRIOR, scanRating, type MasteryState, type ScanRating } from "@/lib/level-check/mastery";

export const MINUTES_PER_OUTCOME = 45;
export const LEVEL_FACTOR: Record<ScanRating | "unknown", number> = { zayif: 1.5, orta: 1, unknown: 1, iyi: 0.4 };
/** Kazanım "zayıf" sayılır: en az 1 yanıt ve ustalık < 0,5 (pekiştirme önerilir). */
export const WEAK_OUTCOME_MAX = 0.5;

export type MapOutcome = { outcomeId: string; code: string; text: string; state: MasteryState };
export type MapUnitInput = {
  unitId: string;
  title: string;
  order: number;
  outcomes: MapOutcome[];
  /** Öğrencinin kendi işareti (kurulumda). Tarama tahmini ("scan") burada verilmez; ustalıktan yeniden hesaplanır. */
  selfRating: ScanRating | null;
};

export type MasteryView = { pct: number | null; label: string; kind: "no_data" | "estimate" | "confident" };

export type MapUnit = MapUnitInput & {
  weight: number;
  state: MasteryState;
  level: ScanRating | null;
  levelSource: "self" | "mastery" | null;
  view: MasteryView;
  minutes: number;
  weakOutcomes: string[];
};

export function masteryView(state: MasteryState): MasteryView {
  const l = masteryLabel(state);
  if (l.kind === "no_data") return { pct: null, label: l.text, kind: l.kind };
  return { pct: Math.round(l.mastery * 100), label: l.text, kind: l.kind };
}

export function unitState(outcomes: readonly MapOutcome[]): MasteryState {
  let alpha = PRIOR.alpha;
  let beta = PRIOR.beta;
  let n = 0;
  for (const o of outcomes) {
    if (o.state.n <= 0) continue;
    alpha += o.state.alpha - PRIOR.alpha;
    beta += o.state.beta - PRIOR.beta;
    n += o.state.n;
  }
  return { alpha: round(alpha), beta: round(beta), n };
}

export function isWeakOutcome(state: MasteryState): boolean {
  return state.n >= 1 && masteryValue(state) < WEAK_OUTCOME_MAX;
}

export function unitMinutes(outcomeCount: number, level: ScanRating | null): number {
  return Math.round(Math.max(1, outcomeCount) * MINUTES_PER_OUTCOME * LEVEL_FACTOR[level ?? "unknown"]);
}

export function buildMapUnit(input: MapUnitInput): MapUnit {
  const state = unitState(input.outcomes);
  const fromMastery = scanRating(state);
  const level = input.selfRating ?? fromMastery;
  return {
    ...input,
    weight: input.outcomes.length,
    state,
    level,
    levelSource: input.selfRating ? "self" : fromMastery ? "mastery" : null,
    view: masteryView(state),
    minutes: unitMinutes(input.outcomes.length, level),
    weakOutcomes: input.outcomes.filter((o) => isWeakOutcome(o.state)).map((o) => o.outcomeId),
  };
}

export function orderUnits<T extends { level: ScanRating | null; weight: number; order: number }>(units: readonly T[]): T[] {
  return [...units].sort(
    (a, b) => Number(b.level === "zayif") - Number(a.level === "zayif") || b.weight - a.weight || a.order - b.order,
  );
}

export type Capacity = { days: number; dailyMinutes: number; minutes: number } | null;

export function capacity(daysLeft: number | null, dailyMinutes: number | null): Capacity {
  if (daysLeft == null || dailyMinutes == null || !Number.isFinite(daysLeft) || !Number.isFinite(dailyMinutes)) return null;
  const days = Math.max(0, Math.floor(daysLeft));
  const daily = Math.max(0, Math.round(dailyMinutes));
  return { days, dailyMinutes: daily, minutes: days * daily };
}

export type PersonalPlan = {
  planned: MapUnit[];
  ifTime: MapUnit[];
  totalMinutes: number;
  plannedMinutes: number;
  capacity: Capacity;
};

/** Kapasite yoksa (sınav tarihi ya da günlük süre bilinmiyor) tüm üniteler plandadır; kesme yapılmaz. */
export function buildPlan(units: readonly MapUnit[], cap: Capacity): PersonalPlan {
  const ordered = orderUnits(units);
  const totalMinutes = ordered.reduce((s, u) => s + u.minutes, 0);
  if (!cap) return { planned: ordered, ifTime: [], totalMinutes, plannedMinutes: totalMinutes, capacity: null };
  const planned: MapUnit[] = [];
  const ifTime: MapUnit[] = [];
  let used = 0;
  for (const u of ordered) {
    if (used + u.minutes <= cap.minutes) {
      planned.push(u);
      used += u.minutes;
    } else ifTime.push(u);
  }
  return { planned, ifTime, totalMinutes, plannedMinutes: used, capacity: cap };
}

/** "34 saat" / "1 saat 30 dk" / "40 dk" */
export function formatHours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} dk`;
  return rest ? `${h} saat ${rest} dk` : `${h} saat`;
}

/** Dürüst toplam cümlesi: "Planın 34 saat, senin 28 saatin var." */
export function totalsSentence(plan: PersonalPlan): string {
  const need = `Planın ${formatHours(plan.totalMinutes)}`;
  if (!plan.capacity) return `${need}. Sınav tarihi ya da günlük süre girilmediği için kalan zamanını hesaplayamıyoruz.`;
  const have = formatHours(plan.capacity.minutes);
  // "28 saat" → "28 saatin"; "1 saat 30 dk" / "40 dk" olduğu gibi.
  return `${need}, senin ${have}${have.endsWith(" saat") ? "in" : ""} var.`;
}

export { CONFIDENT_MIN_N };

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
