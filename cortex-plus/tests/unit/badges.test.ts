import { describe, expect, it } from "vitest";
import {
  BADGE_DEFINITIONS,
  buildBadgeJourney,
  currentRun,
  firstDayReachingRun,
  formatBadgeDate,
  longestRun,
  weekOf,
  type BadgeFacts,
} from "@/lib/gamification/badges";
import { newestUnseenBadge } from "@/components/parity/badge-unlock-notice";
import { liveStreak } from "@/lib/streak/record-activity";

describe("üst çubuktaki seri sayısı", () => {
  // 28 Eylül 2026 öğleden sonra, İstanbul.
  const now = new Date("2026-09-28T12:00:00Z");

  it("keeps a streak whose last day is today or yesterday", () => {
    expect(liveStreak({ current_streak: 5, last_activity_date: "2026-09-28" }, now)).toBe(5);
    expect(liveStreak({ current_streak: 5, last_activity_date: "2026-09-27" }, now)).toBe(5);
  });

  it("shows 0 for a streak that broke days ago instead of the stale number", () => {
    expect(liveStreak({ current_streak: 5, last_activity_date: "2026-09-25" }, now)).toBe(0);
  });
});

function facts(over: Partial<BadgeFacts> = {}): BadgeFacts {
  return {
    firstAnswerAt: null,
    firstPrepAt: null,
    lessonCompletions: [],
    activityDays: [],
    firstMockExamAt: null,
    firstUploadAt: null,
    firstVoiceAt: null,
    bestTopic: null,
    firstReferralAt: null,
    bestReadiness: null,
    latestPrepId: null,
    today: "2026-09-28",
    ...over,
  };
}

const badge = (journey: ReturnType<typeof buildBadgeJourney>, id: string) =>
  journey.badges.find((b) => b.id === id)!;

describe("seri hesabı", () => {
  it("finds the first day a run of n consecutive days was reached", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06"];
    expect(firstDayReachingRun(days, 2)).toBe("2026-09-02");
    expect(firstDayReachingRun(days, 3)).toBe("2026-09-06");
    expect(firstDayReachingRun(days, 4)).toBeNull();
  });

  it("counts runs across month boundaries and ignores duplicates", () => {
    const days = ["2026-08-30", "2026-08-31", "2026-08-31", "2026-09-01"];
    expect(longestRun(days)).toBe(3);
  });

  it("keeps today's run alive until midnight but breaks it after an empty day", () => {
    const days = ["2026-09-26", "2026-09-27"];
    expect(currentRun(days, "2026-09-28")).toBe(2);
    expect(currentRun([...days, "2026-09-28"], "2026-09-28")).toBe(3);
    expect(currentRun(days, "2026-09-29")).toBe(0);
  });

  it("lays out the week from Monday with today's flag", () => {
    // 28 Eylül 2026 pazartesi.
    const week = weekOf(["2026-09-28", "2026-09-30"], "2026-09-30");
    expect(week.map((d) => d.label)).toEqual(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]);
    expect(week[0]).toMatchObject({ iso: "2026-09-28", active: true, isToday: false });
    expect(week[2]).toMatchObject({ iso: "2026-09-30", active: true, isToday: true });
    expect(week[1].active).toBe(false);
  });
});

describe("rozet yolculuğu", () => {
  it("has twelve badges, three of them streak-only", () => {
    expect(BADGE_DEFINITIONS).toHaveLength(12);
    expect(BADGE_DEFINITIONS.filter((d) => d.kind === "streak").map((d) => d.id)).toEqual([
      "ay",
      "saturn",
      "neptun",
    ]);
  });

  it("counts past work: a first answer and a first prep unlock with their own dates", () => {
    const journey = buildBadgeJourney(
      facts({ firstAnswerAt: "2026-09-01T10:00:00Z", firstPrepAt: "2026-09-03T09:00:00Z" }),
    );
    expect(badge(journey, "roket")).toMatchObject({ unlocked: true, unlockedAt: "2026-09-01T10:00:00Z" });
    expect(badge(journey, "dunya")).toMatchObject({ unlocked: true, unlockedAt: "2026-09-03T09:00:00Z" });
    expect(journey.unlockedCount).toBe(2);
  });

  it("needs three completed lessons and dates the badge by the third", () => {
    const two = buildBadgeJourney(facts({ lessonCompletions: ["2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z"] }));
    expect(badge(two, "ay-yorunge")).toMatchObject({
      unlocked: false,
      progress: { value: 2, target: 3, label: "2 / 3 ders" },
    });
    const three = buildBadgeJourney(
      facts({ lessonCompletions: ["2026-09-05T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"] }),
    );
    expect(badge(three, "ay-yorunge")).toMatchObject({ unlocked: true, unlockedAt: "2026-09-05T00:00:00Z" });
  });

  it("unlocks streak badges from history even if the current streak is broken", () => {
    const journey = buildBadgeJourney(
      facts({ activityDays: ["2026-09-01", "2026-09-02", "2026-09-03"], today: "2026-09-28" }),
    );
    expect(badge(journey, "ay")).toMatchObject({ unlocked: true, unlockedAt: "2026-09-03" });
    expect(badge(journey, "saturn")).toMatchObject({
      unlocked: false,
      progress: { value: 0, target: 7, label: "7 gün daha" },
    });
    expect(journey.streak).toMatchObject({ current: 0, longest: 3 });
    expect(journey.nextStreak?.id).toBe("saturn");
  });

  it("shows how far the best topic is from 80% and unlocks only when mastered", () => {
    const partial = buildBadgeJourney(facts({ bestTopic: { pct: 48.4, mastered: false, at: null } }));
    expect(badge(partial, "uranus").progress?.label).toBe("%48 / %80");
    // %85 ama kanıt yetersiz → ustalaşıldı sayılmıyor, çubuk %80'de duruyor.
    const thin = buildBadgeJourney(facts({ bestTopic: { pct: 85, mastered: false, at: null } }));
    expect(badge(thin, "uranus")).toMatchObject({ unlocked: false, progress: { value: 80 } });
    const done = buildBadgeJourney(facts({ bestTopic: { pct: 82, mastered: true, at: "2026-09-20T00:00:00Z" } }));
    expect(badge(done, "uranus")).toMatchObject({ unlocked: true, unlockedAt: "2026-09-20T00:00:00Z" });
  });

  it("uses readiness >= 80 for the last badge", () => {
    const low = buildBadgeJourney(facts({ bestReadiness: { pct: 62, at: null } }));
    expect(badge(low, "ilk-yildiz").progress?.label).toBe("%62 / %80");
    const ready = buildBadgeJourney(facts({ bestReadiness: { pct: 80, at: "2026-09-21T00:00:00Z" } }));
    expect(badge(ready, "ilk-yildiz").unlocked).toBe(true);
  });

  it("picks the first locked task badge as next, skipping streak badges", () => {
    const journey = buildBadgeJourney(
      facts({ firstAnswerAt: "2026-09-01T00:00:00Z", firstPrepAt: "2026-09-01T00:00:00Z" }),
    );
    expect(journey.next?.id).toBe("ay-yorunge");
  });

  it("links prep tasks to the latest prep, or to creating one", () => {
    expect(badge(buildBadgeJourney(facts()), "venus").cta.href).toBe("/deneme-sinavlari/olustur");
    expect(badge(buildBadgeJourney(facts({ latestPrepId: "p1" })), "venus").cta.href).toBe(
      "/deneme-sinavlari/p1/deneme/kurulum",
    );
  });

  it("formats the unlock date in Turkish", () => {
    expect(formatBadgeDate("2026-09-03")).toBe("3 Eylül 2026");
    expect(formatBadgeDate(null)).toBeNull();
  });
});

describe("yeni rozet duyurusu", () => {
  const journey = buildBadgeJourney(
    facts({ firstAnswerAt: "2026-09-01T00:00:00Z", firstUploadAt: "2026-09-10T00:00:00Z" }),
  );

  it("announces nothing on the first check — old badges are marked seen silently", () => {
    expect(newestUnseenBadge(journey, null)).toBeNull();
  });

  it("announces the newest badge the student has not seen", () => {
    expect(newestUnseenBadge(journey, [])?.id).toBe("mars");
    expect(newestUnseenBadge(journey, ["mars"])?.id).toBe("roket");
    expect(newestUnseenBadge(journey, ["mars", "roket"])).toBeNull();
  });
});
