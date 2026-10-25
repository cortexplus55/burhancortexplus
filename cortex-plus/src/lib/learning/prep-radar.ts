/**
 * Hazırlık sayfasının 5 eksenli yetkinlik radarı ve 14 günlük tahmin serisi.
 * Yalnız ölçülen / kayıttaki sayılardan; uydurma yükseliş yok.
 */

export const PREP_RADAR_AXES = [
  { id: "coverage", label: "Konu Kapsamı" },
  { id: "accuracy", label: "Test Doğruluğu" },
  { id: "mock", label: "Deneme Performansı" },
  { id: "retention", label: "Tekrar & Kalıcılık" },
  { id: "tempo", label: "Tempo & Düzen" },
] as const;

export type PrepRadarAxisId = (typeof PREP_RADAR_AXES)[number]["id"];

export type PrepRadarAxis = {
  id: PrepRadarAxisId;
  label: string;
  pct: number;
};

export type PrepRadarView = {
  axes: PrepRadarAxis[];
  readinessPct: number;
  targetScore: number;
  label: string;
};

export type ReadinessForecastPoint = {
  day: number;
  pct: number;
};

export type ReadinessForecastSeries = {
  points: ReadinessForecastPoint[];
  currentPct: number;
  targetPct: number;
  horizonDays: number;
  hitsTargetOn: number | null;
};

function pct(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function retentionFromTopics(
  topics: {
    firstAttemptCorrect: number;
    firstAttemptTotal: number;
    independentCorrect: number;
    independentTotal: number;
    measured: boolean;
  }[],
): number | null {
  let sum = 0;
  let n = 0;
  for (const topic of topics) {
    if (!topic.measured) continue;
    if (topic.independentTotal > 0) {
      sum += topic.independentCorrect / topic.independentTotal;
      n += 1;
    } else if (topic.firstAttemptTotal > 0) {
      sum += topic.firstAttemptCorrect / topic.firstAttemptTotal;
      n += 1;
    }
  }
  return n > 0 ? Math.round((sum / n) * 100) : null;
}

export function tempoFromProgress(input: {
  programPct: number;
  thisWeekMinutes?: number | null;
  dailyGoalMinutes?: number | null;
  weekActivities?: number;
}): number {
  const program = pct(input.programPct);
  const goal = input.dailyGoalMinutes ?? 0;
  const weekMin = input.thisWeekMinutes ?? 0;
  const regularity =
    goal > 0 ? Math.max(0, Math.min(100, Math.round((weekMin / (goal * 7)) * 100))) : null;
  if (regularity == null) {
    const activities = input.weekActivities ?? 0;
    return Math.max(program, Math.min(100, activities * 12));
  }
  return Math.round(0.55 * program + 0.45 * regularity);
}

export function buildPrepRadarView(input: {
  readinessPct: number;
  targetScore: number;
  coveragePct?: number | null;
  accuracyPct?: number | null;
  mockPct?: number | null;
  retentionPct?: number | null;
  tempoPct?: number | null;
}): PrepRadarView {
  const targetScore = pct(input.targetScore) || 75;
  const readinessPct = pct(input.readinessPct);
  const values: Record<PrepRadarAxisId, number> = {
    coverage: pct(input.coveragePct),
    accuracy: pct(input.accuracyPct),
    mock: pct(input.mockPct),
    retention: pct(input.retentionPct),
    tempo: pct(input.tempoPct),
  };
  const axes = PREP_RADAR_AXES.map((axis) => ({
    id: axis.id,
    label: axis.label,
    pct: values[axis.id],
  }));
  let label = "Hazırlık tahmini oluşuyor";
  if (readinessPct >= targetScore) label = "Hedef bandındasın";
  else if (readinessPct >= 80) label = "İyi gidiyorsun; eksikler var";
  else if (readinessPct >= 50) label = "Orta hazırlık — zayıf konulara dön";
  else if (readinessPct > 0) label = "Hazırlık henüz düşük";
  return { axes, readinessPct, targetScore, label };
}

/**
 * Mevcut hazırlık + günlük kazançtan 14 gün (veya sınava kalan) kesikli tahmin.
 * Kazanç yoksa eğri neredeyse düz kalır — "başlamadan zirveye çıkacak" yalanı yok.
 */
export function buildReadinessForecastSeries(input: {
  currentPct: number;
  targetPct: number;
  gainPerDay: number;
  daysRemaining?: number | null;
  horizon?: number;
}): ReadinessForecastSeries {
  const currentPct = pct(input.currentPct);
  const targetPct = pct(input.targetPct) || 75;
  const remaining =
    typeof input.daysRemaining === "number" && Number.isFinite(input.daysRemaining)
      ? Math.max(1, Math.round(input.daysRemaining))
      : 14;
  const horizonDays = Math.max(1, Math.min(14, input.horizon ?? remaining, remaining));
  const gain = Math.max(0, Math.min(8, input.gainPerDay));
  const room = Math.max(0, 100 - currentPct);
  const rate = room <= 0 ? 0 : Math.min(0.22, gain / Math.max(room * 0.22, 5));
  const points: ReadinessForecastPoint[] = [];
  let hitsTargetOn: number | null = currentPct >= targetPct ? 0 : null;
  for (let day = 0; day <= horizonDays; day += 1) {
    const next =
      room <= 0
        ? 100
        : Math.round(currentPct + room * (1 - Math.pow(1 - rate, day)));
    const value = Math.max(currentPct, Math.min(100, next));
    points.push({ day, pct: value });
    if (hitsTargetOn == null && value >= targetPct) hitsTargetOn = day;
  }
  return { points, currentPct, targetPct, horizonDays, hitsTargetOn };
}
