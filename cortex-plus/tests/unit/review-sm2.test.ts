import { describe, expect, it } from "vitest";
import {
  applySm2,
  dueInLabel,
  nextEase,
  previewReviewIntervals,
  qualityFromCorrect,
  sm2FromStep,
  sm2Graduates,
  stepFromInterval,
} from "@/lib/learning/review-sm2";
import { nextReviewStep } from "@/lib/learning/review-items";

describe("SM-2", () => {
  it("doğru kalite 4, yanlış kalite 1", () => {
    expect(qualityFromCorrect(true)).toBe(4);
    expect(qualityFromCorrect(false)).toBe(1);
  });

  it("ilk kartta önizleme 1 / 4 / 9 gün", () => {
    expect(previewReviewIntervals(sm2FromStep(0))).toEqual({ hard: 1, good: 4, easy: 9 });
    expect(dueInLabel(1)).toBe("1 gün sonra");
    expect(dueInLabel(9)).toBe("9 gün sonra");
  });

  it("kalite 1 ease düşürür ve 1. güne döner", () => {
    const next = applySm2({ easeFactor: 2.5, intervalDays: 7, repetitions: 2 }, 1);
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(0);
    expect(next.easeFactor).toBeLessThan(2.5);
    expect(next.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("kalite 5 ease yükseltir ve daha uzun aralığa sıçrar", () => {
    const good = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 4);
    const easy = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 5);
    expect(easy.easeFactor).toBeGreaterThan(good.easeFactor);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
  });

  it("dört başarılı tekrardan sonra öğrenildi; boolean çağrı çalışır", () => {
    expect(sm2Graduates({ easeFactor: 2.5, intervalDays: 35, repetitions: 4 }, 4)).toBe(true);
    expect(nextEase(2.5, 5)).toBeGreaterThan(2.5);
    expect(stepFromInterval(4)).toBe(1);
    expect(nextReviewStep({ step: 0, correct: true, today: "2026-10-20", examDate: null })).toMatchObject({
      step: 1,
      dueOn: "2026-10-24",
      status: "active",
    });
  });
});
