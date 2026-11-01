/**
 * Hakimiyet Haritası + Kişisel Program (Plan PR 4). Saf ve deterministik; model çağrısı yok, istemcide de çalışır.
 *
 * Ustalık
 * - Kazanım: Beta ortalaması α / (α + β) (outcome_mastery).
 * - Ünite yüzdesi: YANITLI kazanımların yüzdelerinin basit ortalaması — haritada açılan kazanım değerleriyle
 *   tutarlıdır. Güven etiketi ünitedeki toplam yanıt sayısından (≥3 → "N yanıta dayalı", altı "tahmini").
 * - Seviye: ünitede yanıt varsa ustalıktan (<%50 Zayıf — pekiştirme eşiğiyle aynı —, ≥%75 Biliyorum, arası Orta) — plan ustalıkla yeniden
 *   sıralanır; yanıt yoksa öğrencinin kendi işareti; o da yoksa bilinmiyor.
 *
 * Süre tahmini (dürüst, sabit tablo)
 * - Bir kazanım ≈ 5–8 soru × 3–5 dk + kısa konu tekrarı ⇒ 20–40 dk.
 * - `OUTCOME_MINUTES`: Zayıf 40 · Orta/bilinmiyor 30 · Biliyorum 20 dk. Kazanımın kendi yanıtı varsa kendi
 *   seviyesi, yoksa ünitenin seviyesi kullanılır. Ünite süresi = kazanım sürelerinin toplamı.
 *
 * Sıra ve kapasite
 * - Öncelik: Zayıf → Orta/bilinmiyor → Biliyorum; aynı katmanda ağırlık (kazanım sayısı) yüksek olan; eşitlikte hazırlık sırası.
 * - Kapasite = kalan gün × günlük dakika. Sıra katıdır: hiçbir alt öncelikli ünite üsttekinin önüne geçmez.
 *   Sığmayan ilk ünite kısmen planlanır (en zayıf kazanımları önce); kalanı ve sonrakilerin tamamı "Zaman kalırsa".
 */
import { CONFIDENT_MIN_N, masteryValue, PRIOR, type MasteryState, type ScanRating } from "@/lib/level-check/mastery";

export const OUTCOME_MINUTES: Record<ScanRating | "unknown", number> = { zayif: 40, orta: 30, unknown: 30, iyi: 20 };
export const OUTCOME_MINUTES_MIN = 20;
export const OUTCOME_MINUTES_MAX = 40;
const KNOWN_MIN = 0.75;
/** Kazanım "zayıf" sayılır: en az 1 yanıt ve ustalık < 0,5 (pekiştirme önerilir). */
export const WEAK_OUTCOME_MAX = 0.5;
export const UNIT_PCT_NOTE = "Ünite yüzdesi, yanıt verdiğin kazanımların yüzdelerinin ortalamasıdır.";

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
  /** Yanıtlı kazanımların ortalama ustalığı (0–1); veri yoksa null. */
  mastery: number | null;
  n: number;
  level: ScanRating | null;
  levelSource: "self" | "mastery" | null;
  view: MasteryView;
  minutes: number;
  /** Kazanım başına tahmini dakika (outcomes ile aynı sırada). */
  outcomeMinutes: number[];
  weakOutcomes: string[];
};

function viewOf(mastery: number | null, n: number): MasteryView {
  if (mastery == null || n <= 0) return { pct: null, label: "Henüz yeterli veri yok", kind: "no_data" };
  const pct = Math.round(mastery * 100);
  if (n < CONFIDENT_MIN_N) return { pct, label: "tahmini", kind: "estimate" };
  return { pct, label: `${n} yanıta dayalı`, kind: "confident" };
}

export function masteryView(state: MasteryState): MasteryView {
  return viewOf(state.n > 0 ? masteryValue(state) : null, state.n);
}

export function levelFromMastery(m: number | null): ScanRating | null {
  if (m == null) return null;
  if (m < WEAK_OUTCOME_MAX) return "zayif";
  if (m >= KNOWN_MIN) return "iyi";
  return "orta";
}

/** Yanıtlı kazanımların ortalama ustalığı ve toplam yanıt sayısı. */
export function unitMastery(outcomes: readonly MapOutcome[]): { mastery: number | null; n: number } {
  const seen = outcomes.filter((o) => o.state.n > 0);
  const n = seen.reduce((s, o) => s + o.state.n, 0);
  if (!seen.length) return { mastery: null, n: 0 };
  return { mastery: seen.reduce((s, o) => s + masteryValue(o.state), 0) / seen.length, n };
}

export function isWeakOutcome(state: MasteryState): boolean {
  return state.n >= 1 && masteryValue(state) < WEAK_OUTCOME_MAX;
}

export function outcomeMinutes(state: MasteryState, unitLevel: ScanRating | null): number {
  const level = state.n > 0 ? levelFromMastery(masteryValue(state)) : unitLevel;
  return OUTCOME_MINUTES[level ?? "unknown"];
}

export function buildMapUnit(input: MapUnitInput): MapUnit {
  const { mastery, n } = unitMastery(input.outcomes);
  const fromMastery = levelFromMastery(mastery);
  const level = fromMastery ?? input.selfRating;
  const outcomes = input.outcomes.length ? input.outcomes : [];
  const mins = outcomes.map((o) => outcomeMinutes(o.state, level));
  return {
    ...input,
    weight: input.outcomes.length,
    mastery,
    n,
    level,
    levelSource: fromMastery ? "mastery" : input.selfRating ? "self" : null,
    view: viewOf(mastery, n),
    outcomeMinutes: mins,
    minutes: mins.length ? mins.reduce((s, m) => s + m, 0) : OUTCOME_MINUTES[level ?? "unknown"],
    weakOutcomes: input.outcomes.filter((o) => isWeakOutcome(o.state)).map((o) => o.outcomeId),
  };
}

const TIER: Record<ScanRating | "unknown", number> = { zayif: 0, orta: 1, unknown: 1, iyi: 2 };

export function orderUnits<T extends { level: ScanRating | null; weight: number; order: number }>(units: readonly T[]): T[] {
  return [...units].sort((a, b) => TIER[a.level ?? "unknown"] - TIER[b.level ?? "unknown"] || b.weight - a.weight || a.order - b.order);
}

export type Capacity = { days: number; dailyMinutes: number; minutes: number } | null;

export function capacity(daysLeft: number | null, dailyMinutes: number | null): Capacity {
  if (daysLeft == null || dailyMinutes == null || !Number.isFinite(daysLeft) || !Number.isFinite(dailyMinutes)) return null;
  const days = Math.max(0, Math.floor(daysLeft));
  const daily = Math.max(0, Math.round(dailyMinutes));
  return { days, dailyMinutes: daily, minutes: days * daily };
}

/** Plan satırı: bir ünite ya da (kısmi) bir parçası. */
export type PlanEntry = { unit: MapUnit; outcomes: MapOutcome[]; minutes: number; partial: boolean };

export type PersonalPlan = {
  planned: PlanEntry[];
  ifTime: PlanEntry[];
  totalMinutes: number;
  plannedMinutes: number;
  capacity: Capacity;
};

/** En zayıf kazanım önce: yanıtlı ve düşük ustalık; yanıtsız kazanım %50 sayılır; eşitlikte resmî sıra. */
function weakestFirst(u: MapUnit): { o: MapOutcome; m: number }[] {
  return u.outcomes
    .map((o, i) => ({ o, m: u.outcomeMinutes[i]!, k: o.state.n > 0 ? masteryValue(o.state) : 0.5, i }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map(({ o, m }) => ({ o, m }));
}

/** Kapasite yoksa (sınav tarihi ya da günlük süre bilinmiyor) tüm üniteler plandadır; kesme yapılmaz. */
export function buildPlan(units: readonly MapUnit[], cap: Capacity): PersonalPlan {
  const ordered = orderUnits(units);
  const totalMinutes = ordered.reduce((s, u) => s + u.minutes, 0);
  const whole = (u: MapUnit): PlanEntry => ({ unit: u, outcomes: u.outcomes, minutes: u.minutes, partial: false });
  if (!cap) return { planned: ordered.map(whole), ifTime: [], totalMinutes, plannedMinutes: totalMinutes, capacity: null };
  const planned: PlanEntry[] = [];
  const ifTime: PlanEntry[] = [];
  let used = 0;
  let full = false;
  for (const u of ordered) {
    if (!full && used + u.minutes <= cap.minutes) {
      planned.push(whole(u));
      used += u.minutes;
      continue;
    }
    if (full) {
      ifTime.push(whole(u));
      continue;
    }
    // Sığmayan ilk ünite: en zayıf kazanımlarından sığanlar plana, kalanı "Zaman kalırsa"; sıra burada kilitlenir.
    full = true;
    const now: { o: MapOutcome; m: number }[] = [];
    const later: { o: MapOutcome; m: number }[] = [];
    for (const x of weakestFirst(u)) {
      if (!later.length && used + x.m <= cap.minutes) {
        now.push(x);
        used += x.m;
      } else later.push(x);
    }
    const sum = (xs: { m: number }[]) => xs.reduce((s, x) => s + x.m, 0);
    if (now.length) planned.push({ unit: u, outcomes: now.map((x) => x.o), minutes: sum(now), partial: true });
    if (later.length) ifTime.push({ unit: u, outcomes: later.map((x) => x.o), minutes: sum(later), partial: now.length > 0 });
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

export { CONFIDENT_MIN_N, PRIOR };
