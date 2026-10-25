import { describe, expect, it } from "vitest";
import {
  FREE_FREEZES_PER_WEEK,
  PLUS_FREEZES_PER_WEEK,
  freezeAllowance,
  liveStreakWithFreeze,
  missedDayIfOneGap,
  nextStreakAfterActivity,
} from "@/lib/streak/streak-freeze";

describe("Seri Kalkanı", () => {
  it("haftalık hak: ücretsiz 1, Plus 2", () => {
    expect(freezeAllowance(false)).toBe(FREE_FREEZES_PER_WEEK);
    expect(freezeAllowance(true)).toBe(PLUS_FREEZES_PER_WEEK);
  });

  it("yalnız bir günlük boşlukta dünü kaçırılmış sayar", () => {
    expect(missedDayIfOneGap("2026-10-23", "2026-10-25")).toBe("2026-10-24");
    expect(missedDayIfOneGap("2026-10-20", "2026-10-25")).toBeNull();
  });

  it("seri ≥ 2 ve kalkan varken bir gün boşluğu korur", () => {
    expect(
      nextStreakAfterActivity({
        existing: { current: 5, last: "2026-10-23" },
        today: "2026-10-25",
        yesterday: "2026-10-24",
        canFreeze: true,
      }),
    ).toEqual({ current: 6, freezeUsed: true, missedDay: "2026-10-24" });
  });

  it("kalkan yoksa veya seri 1 ise sıfırlar", () => {
    expect(
      nextStreakAfterActivity({
        existing: { current: 5, last: "2026-10-23" },
        today: "2026-10-25",
        yesterday: "2026-10-24",
        canFreeze: false,
      }),
    ).toEqual({ current: 1, freezeUsed: false, missedDay: "2026-10-24" });
    expect(
      nextStreakAfterActivity({
        existing: { current: 1, last: "2026-10-23" },
        today: "2026-10-25",
        yesterday: "2026-10-24",
        canFreeze: true,
      }),
    ).toEqual({ current: 1, freezeUsed: false, missedDay: "2026-10-24" });
  });

  it("gösterimde bir günlük boşluk kalkanla ayakta kalır", () => {
    expect(liveStreakWithFreeze({ current: 8, last: "2026-10-23", today: "2026-10-25", remaining: 1 })).toEqual({
      streak: 8,
      protected: true,
    });
    expect(liveStreakWithFreeze({ current: 8, last: "2026-10-23", today: "2026-10-25", remaining: 0 })).toEqual({
      streak: 0,
      protected: false,
    });
  });
});
