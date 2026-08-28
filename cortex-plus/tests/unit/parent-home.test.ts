import { describe, expect, it } from "vitest";
import {
  buildStudyDayFlags,
  planBadgeFromName,
} from "@/lib/parent/study-days";

describe("veli çalışma günleri", () => {
  it("son 14 günde aktif günleri soldan sağa dizer", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    const flags = buildStudyDayFlags(
      ["2026-08-28T09:00:00.000Z", "2026-08-15T09:00:00.000Z"],
      14,
      now,
    );
    expect(flags).toHaveLength(14);
    expect(flags[0]).toBe(true);
    expect(flags[13]).toBe(true);
    expect(flags.filter(Boolean)).toHaveLength(2);
  });

  it("plan adından Plus / Sigma rozeti üretir", () => {
    expect(planBadgeFromName("Cortex Plus")).toBe("Plus");
    expect(planBadgeFromName("Sigma")).toBe("Sigma");
    expect(planBadgeFromName(null)).toBe(null);
  });
});
