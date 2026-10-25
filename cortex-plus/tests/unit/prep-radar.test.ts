import { describe, expect, it } from "vitest";
import {
  buildPrepRadarView,
  buildReadinessForecastSeries,
  retentionFromTopics,
  tempoFromProgress,
} from "@/lib/learning/prep-radar";

describe("5 eksenli hazırlık radarı", () => {
  it("maps measured axes and keeps the target in view", () => {
    const view = buildPrepRadarView({
      readinessPct: 62,
      targetScore: 85,
      coveragePct: 70,
      accuracyPct: 80,
      mockPct: 55,
      retentionPct: 48,
      tempoPct: 40,
    });
    expect(view.axes.map((axis) => axis.id)).toEqual([
      "coverage",
      "accuracy",
      "mock",
      "retention",
      "tempo",
    ]);
    expect(view.axes.map((axis) => axis.pct)).toEqual([70, 80, 55, 48, 40]);
    expect(view.readinessPct).toBe(62);
    expect(view.targetScore).toBe(85);
    expect(view.label).toMatch(/Orta hazırlık/);
  });

  it("reads retention from first-attempt / independent rates", () => {
    expect(
      retentionFromTopics([
        {
          measured: true,
          firstAttemptCorrect: 3,
          firstAttemptTotal: 4,
          independentCorrect: 2,
          independentTotal: 4,
        },
        {
          measured: false,
          firstAttemptCorrect: 0,
          firstAttemptTotal: 0,
          independentCorrect: 0,
          independentTotal: 0,
        },
      ]),
    ).toBe(50);
    expect(tempoFromProgress({ programPct: 40, thisWeekMinutes: 90, dailyGoalMinutes: 45 })).toBe(35);
  });
});

describe("14 günlük hazırlık tahmini", () => {
  it("starts at the current score and draws a 14-day dashed climb toward the target", () => {
    const series = buildReadinessForecastSeries({
      currentPct: 40,
      targetPct: 80,
      gainPerDay: 3,
      daysRemaining: 20,
    });
    expect(series.horizonDays).toBe(14);
    expect(series.points[0]).toEqual({ day: 0, pct: 40 });
    expect(series.points[series.points.length - 1]!.pct).toBeGreaterThan(40);
    expect(series.points.every((point, index) => index === 0 || point.pct >= series.points[index - 1]!.pct)).toBe(true);
    expect(series.hitsTargetOn).toBeGreaterThan(0);
  });

  it("stays almost flat when there is no measured pace", () => {
    const series = buildReadinessForecastSeries({
      currentPct: 12,
      targetPct: 75,
      gainPerDay: 0.15,
      daysRemaining: 8,
    });
    expect(series.horizonDays).toBe(8);
    expect(series.points[series.points.length - 1]!.pct).toBeLessThan(30);
    expect(series.hitsTargetOn).toBeNull();
  });
});
