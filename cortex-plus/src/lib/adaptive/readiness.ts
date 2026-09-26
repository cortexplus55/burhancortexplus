import type { ReadinessForecast, TopicMasteryState } from "@/lib/adaptive/types";

/** Minimum display change (percentage points) to avoid jitter from one easy item. */
export const READINESS_DEADBAND = 3;

export function forecastFromState(input: {
  readinessPct: number | null;
  daysRemaining: number | null;
  behindSchedule: boolean;
  openHighSeverityGaps: number;
}): ReadinessForecast {
  const ready = input.readinessPct ?? 0;
  if (input.daysRemaining != null && input.daysRemaining <= 3 && ready < 70) {
    return "critical";
  }
  if (input.behindSchedule || ready < 45 || input.openHighSeverityGaps >= 3) {
    return "behind";
  }
  if (ready < 60 || input.openHighSeverityGaps >= 1) return "slight_risk";
  return "on_track";
}

/**
 * Smooth readiness for display: EMA toward raw, then deadband vs previous.
 * One easy correct must not jump e.g. 58 → 81.
 */
export function stabilizeReadiness(
  rawPct: number,
  previousPct: number | null,
  options?: { alpha?: number; deadband?: number },
): number {
  const alpha = options?.alpha ?? 0.35;
  const deadband = options?.deadband ?? READINESS_DEADBAND;
  const clamped = Math.max(0, Math.min(100, Math.round(rawPct)));
  if (previousPct == null) return clamped;
  const ema = previousPct * (1 - alpha) + clamped * alpha;
  const rounded = Math.round(ema);
  if (Math.abs(rounded - previousPct) < deadband) {
    return previousPct;
  }
  return Math.max(0, Math.min(100, rounded));
}

export function computeAdaptiveReadiness(input: {
  topics: TopicMasteryState[];
  importanceByKey: Map<string, number>;
  daysRemaining: number | null;
  overdueReviews: number;
  coveragePct: number;
  behindSchedule: boolean;
  /** Prior displayed readiness for deadband/EMA. */
  previousReadinessPct?: number | null;
}): {
  readinessPct: number;
  rawReadinessPct: number;
  forecast: ReadinessForecast;
  summary: string;
} {
  const topics = input.topics;
  if (!topics.length) {
    return {
      readinessPct: 0,
      rawReadinessPct: 0,
      forecast: "slight_risk",
      summary: "Henüz ölçülmüş konu yok.",
    };
  }

  let weightSum = 0;
  let masterySum = 0;
  let confSum = 0;
  for (const t of topics) {
    const w = input.importanceByKey.get(t.topicKey) ?? 1;
    weightSum += w;
    masterySum += t.mastery * w * (0.5 + 0.5 * t.masteryConfidence);
    confSum += t.masteryConfidence;
  }
  const weighted = weightSum > 0 ? masterySum / weightSum : 0;
  const avgConf = confSum / topics.length;
  const overduePenalty = Math.min(0.2, input.overdueReviews * 0.04);
  const coverageFactor = Math.max(0.4, Math.min(1, input.coveragePct / 100));
  const timePressure =
    input.daysRemaining != null && input.daysRemaining < 7 ? 0.95 : 1;

  const rawReadinessPct = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        weighted * 100 * coverageFactor * timePressure * (0.85 + 0.15 * avgConf) -
          overduePenalty * 100,
      ),
    ),
  );

  const readinessPct = stabilizeReadiness(
    rawReadinessPct,
    input.previousReadinessPct ?? null,
  );

  const forecast = forecastFromState({
    readinessPct,
    daysRemaining: input.daysRemaining,
    behindSchedule: input.behindSchedule,
    openHighSeverityGaps: topics.filter((t) => t.repeatedErrorCount >= 2)
      .length,
  });

  const weak = topics
    .filter((t) => t.mastery < 0.5)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 2);

  const summary =
    weak.length > 0
      ? `Hazırlık seviyesi %${readinessPct}. ${weak.length} konuda ek tekrar gerekiyor.`
      : `Hazırlık seviyesi %${readinessPct}. Programın zamanında ilerliyor.`;

  return { readinessPct, rawReadinessPct, forecast, summary };
}
