import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clampTargetScore,
  extraPracticeForTarget,
  masteryBarForTarget,
  reviewPassesForTarget,
  targetPlanHint,
  targetPlanMode,
  targetTempoFactor,
} from "@/lib/learning/target-plan";

describe("hedef puana göre plan kipi", () => {
  it("splits 50–100 into pass / solid / peak", () => {
    expect(targetPlanMode(null)).toBe("solid");
    expect(targetPlanMode(69)).toBe("pass");
    expect(targetPlanMode(70)).toBe("solid");
    expect(targetPlanMode(84)).toBe("solid");
    expect(targetPlanMode(85)).toBe("peak");
    expect(clampTargetScore(380)).toBe(100);
    expect(masteryBarForTarget(90)).toBe(90);
    expect(masteryBarForTarget(60)).toBe(60);
    expect(targetTempoFactor(90)).toBeGreaterThan(1);
    expect(targetTempoFactor(55)).toBeLessThan(1);
  });

  it("writes a live badge for the wizard slider", () => {
    expect(targetPlanHint(90).badge).toMatch(/daha çok soru/);
    expect(targetPlanHint(75).badge).toMatch(/dengeli/);
    expect(targetPlanHint(55).badge).toMatch(/en çok çıkan konular/);
  });

  it("adds extra quizzes on peak and keeps pass compact", () => {
    expect(extraPracticeForTarget(0, 90)).toBe(2);
    expect(extraPracticeForTarget(1, 75)).toBe(1);
    expect(extraPracticeForTarget(2, 55)).toBe(0);
    expect(reviewPassesForTarget(90, { examHeavy: true })).toBe(2);
    expect(reviewPassesForTarget(55, {})).toBe(0);
    expect(reviewPassesForTarget(55, { measuredLevel: "weak" })).toBe(1);
  });

  it("wizard slider shows the live badge", () => {
    const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    expect(wizard).toContain("targetPlanHint(target).badge");
    expect(wizard).toContain("apw-target-hint");
  });
});
