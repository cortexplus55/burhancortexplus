import { describe, expect, it } from "vitest";
import {
  isCardMastered,
  nextCardSchedule,
  scheduleHint,
  type CardScheduleState,
} from "@/lib/learning/spaced-repetition";

const NOW = new Date("2026-09-26T12:00:00.000Z");

function fresh(): CardScheduleState {
  return { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
}

describe("nextCardSchedule", () => {
  it("resets interval and requeues on missed", () => {
    const next = nextCardSchedule(fresh(), "missed", NOW);
    expect(next.intervalDays).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.ease).toBeCloseTo(2.3);
    expect(next.requeueAfter).toBe(3);
    expect(next.dueAt.getTime() - NOW.getTime()).toBe(10 * 60_000);
    expect(scheduleHint(next)).toBe("10 dk sonra");
  });

  it("floors ease at 1.3", () => {
    const state = { ease: 1.35, intervalDays: 2, reps: 2, lapses: 1 };
    const missed = nextCardSchedule(state, "missed", NOW);
    expect(missed.ease).toBe(1.3);
    const hard = nextCardSchedule({ ...state, ease: 1.4 }, "hard", NOW);
    expect(hard.ease).toBe(1.3);
  });

  it("schedules hard with 1.2× interval", () => {
    const next = nextCardSchedule(
      { ease: 2.5, intervalDays: 2, reps: 2, lapses: 0 },
      "hard",
      NOW,
    );
    expect(next.intervalDays).toBe(2.4);
    expect(next.reps).toBe(3);
  });

  it("schedules knew: 1 day then 3 then ease×interval", () => {
    const first = nextCardSchedule(fresh(), "knew", NOW);
    expect(first.intervalDays).toBe(1);
    expect(first.reps).toBe(1);

    const second = nextCardSchedule(first, "knew", NOW);
    expect(second.intervalDays).toBe(3);

    const third = nextCardSchedule(second, "knew", NOW);
    expect(third.intervalDays).toBeCloseTo(3 * 2.5);
  });

  it("compresses interval when exam is in 6 days (≤3)", () => {
    const next = nextCardSchedule(
      { ease: 2.5, intervalDays: 3, reps: 2, lapses: 0 },
      "knew",
      NOW,
      "2026-10-02",
    );
    expect(next.intervalDays).toBeLessThanOrEqual(3);
  });

  it("marks mastered at interval ≥ 7 or reps≥3 with two knew", () => {
    const long = nextCardSchedule(
      { ease: 2.5, intervalDays: 4, reps: 4, lapses: 0, recentRatings: ["knew", "knew"] },
      "knew",
      NOW,
    );
    // 4 * 2.5 = 10 ≥ 7
    expect(long.mastered).toBe(true);
    expect(
      isCardMastered({
        intervalDays: 7,
        reps: 2,
        recentRatings: ["hard", "knew"],
      }),
    ).toBe(true);
    expect(
      isCardMastered({
        intervalDays: 3,
        reps: 3,
        recentRatings: ["knew", "knew"],
      }),
    ).toBe(true);
  });
});
