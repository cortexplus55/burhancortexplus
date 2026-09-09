import { describe, expect, it } from "vitest";
import { daysUntilExam } from "@/lib/learning/exam-prep-plan";

describe("exam countdown uses the Turkish calendar", () => {
  it("changes at Istanbul midnight even while UTC is on the previous date", () => {
    expect(daysUntilExam("2026-09-21", new Date("2026-09-09T20:59:59Z"))).toBe(12);
    expect(daysUntilExam("2026-09-21", new Date("2026-09-09T21:00:00Z"))).toBe(11);
  });

  it("keeps the minimum one-day planning window on or after the exam", () => {
    expect(daysUntilExam("2026-09-21", new Date("2026-09-21T10:00:00Z"))).toBe(1);
    expect(daysUntilExam("2026-09-21", new Date("2026-09-22T10:00:00Z"))).toBe(1);
  });
});
