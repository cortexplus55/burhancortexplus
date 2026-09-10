import { describe, expect, it } from "vitest";
import {
  buildExamScheduleV2,
  estimateTopicMinutes,
  listStudyDayDates,
  orderTopicsByPrerequisites,
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";

const topics = (n: number): ScheduleTopicInput[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    title: `Konu ${i + 1}`,
    objective: `Hedef ${i + 1}`,
    pageNumbers: [i + 1, i + 2],
    measuredLevel: i === 0 ? "weak" : i === n - 1 ? "solid" : "emerging",
    prerequisites: i > 0 ? [`Konu ${i}`] : [],
  }));

describe("exam-schedule-v2", () => {
  it("orders by prerequisites before later topics", () => {
    const ordered = orderTopicsByPrerequisites([
      {
        id: "b",
        title: "Birim çember",
        prerequisites: ["Derece"],
        measuredLevel: "emerging",
      },
      { id: "a", title: "Derece", measuredLevel: "weak" },
      {
        id: "c",
        title: "Kimlikler",
        prerequisites: ["Birim çember"],
        measuredLevel: "solid",
      },
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("lists only selected study weekdays within the exam window", () => {
    // 2026-09-08 is Tuesday
    const dates = listStudyDayDates(7, [1, 3, 5], new Date("2026-09-08T12:00:00"));
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => {
      const day = new Date(`${d}T12:00:00`).getDay();
      return day === 1 || day === 3 || day === 5;
    })).toBe(true);
  });

  it("builds sessions with topic, objective, pages, duration", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 14,
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4, 5],
      topics: topics(4),
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    expect(plan.sessions.length).toBeGreaterThan(3);
    for (const s of plan.sessions) {
      expect(s.topicTitle.length).toBeGreaterThan(0);
      expect(s.objective.length).toBeGreaterThan(0);
      expect(s.durationMinutes).toBeGreaterThanOrEqual(10);
      expect(s.calendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const lastDay = Math.max(...plan.sessions.map((s) => s.dayIndex));
    expect(
      plan.sessions.some((s) => s.dayIndex === lastDay && s.role === "mock"),
    ).toBe(true);
    expect(
      plan.sessions.every(
        (s) => !(s.dayIndex === lastDay && s.role === "learn"),
      ),
    ).toBe(true);
  });

  it("spreads new learning over a long plan instead of front-loading it", () => {
    // 30 günlük bir hazırlık, ilk 10 güne yığılıp ortada boş hafta bırakmamalı.
    const plan = buildExamScheduleV2({
      daysToExam: 30,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5],
      topics: topics(9),
      fromDate: new Date("2026-09-10T12:00:00"),
    });
    const learnDays = plan.sessions
      .filter((s) => s.role === "learn")
      .map((s) => s.dayIndex);
    const lastDay = Math.max(...plan.sessions.map((s) => s.dayIndex));
    // Son "yeni konu" günü, dönemin ilk üçte birinde bitmemeli.
    expect(Math.max(...learnDays)).toBeGreaterThan(lastDay / 3);
    // Ve dönemin sonuna da sarkmamalı — orası tekrar/deneme için.
    expect(Math.max(...learnDays)).toBeLessThan(lastDay);
  });

  it("keeps every topic when time is short — compresses instead of cutting", () => {
    const heavy = topics(8).map((t) => ({
      ...t,
      pageNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      measuredLevel: "weak" as const,
      selfHard: true,
    }));
    const plan = buildExamScheduleV2({
      daysToExam: 3,
      dailyMinutes: 20,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: heavy,
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    // Dar zaman planın vaadini daraltır, kapsamı değil: sınavda o konular da
    // çıkacağı için hiçbiri plandan atılmaz.
    expect(plan.fits).toBe(false);
    expect(plan.optionsIfTight.length).toBeGreaterThan(0);
    expect(plan.optionsIfTight).toContain("increase_daily_time");
    expect(plan.cutTopicIds).toEqual([]);
    expect(plan.orderedTopicIds).toHaveLength(heavy.length);
    const scheduled = new Set(plan.sessions.map((s) => s.topicId));
    for (const topic of heavy) expect(scheduled.has(topic.id)).toBe(true);
  });

  it("3/7/14 day plans are not the same list stretched", () => {
    const base = topics(6);
    const from = new Date("2026-09-08T12:00:00");
    const p3 = buildExamScheduleV2({
      daysToExam: 3,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: base,
      fromDate: from,
    });
    const p7 = buildExamScheduleV2({
      daysToExam: 7,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: base,
      fromDate: from,
    });
    const p14 = buildExamScheduleV2({
      daysToExam: 14,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: base,
      fromDate: from,
    });
    const fingerprint = (p: typeof p3) =>
      JSON.stringify({
        days: p.studyDayDates.length,
        cuts: p.cutTopicIds.slice().sort(),
        roles: p.sessions.map((s) => `${s.dayIndex}:${s.role}:${s.topicId}`),
        avail: p.availableMinutes,
      });
    expect(fingerprint(p3)).not.toEqual(fingerprint(p7));
    expect(fingerprint(p7)).not.toEqual(fingerprint(p14));
    // Short horizon should cut more or schedule denser differently.
    expect(p3.cutTopicIds.length).toBeGreaterThanOrEqual(p14.cutTopicIds.length);
  });

  it("redistribute keeps completed calendar rows and only rebuilds remaining", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 10,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5],
      topics: topics(3),
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    const first = plan.sessions[0];
    const next = redistributeRemainingSchedule({
      previous: plan,
      completed: [{ sortOrder: first.sortOrder, calendarDate: first.calendarDate }],
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5],
      daysToExam: 8,
      topics: topics(3),
      fromDate: new Date("2026-09-10T12:00:00"),
    });
    expect(
      next.sessions.some(
        (s) =>
          s.calendarDate === first.calendarDate &&
          s.sortOrder === first.sortOrder,
      ),
    ).toBe(true);
    expect(next.summary).toMatch(/Kaçırılan günler|yeniden dağıtıldı/i);
  });

  it("maps sessions to node drafts for the legacy graph insert", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 5,
      dailyMinutes: 40,
      studyDays: [1, 2, 3, 4, 5],
      topics: topics(2),
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    const drafts = scheduleSessionsToNodeDrafts(plan.sessions);
    expect(drafts[0].kind).toBeTruthy();
    expect(drafts[0].meta.durationMinutes).toBeGreaterThan(0);
  });

  it("teaches with a lesson, not a podcast", () => {
    // learn uzun süre "podcast"e bağlıydı: öğretme adımı en kırılgan ve
    // en pahalı üretim türüne dayanıyordu, üretim düştüğünde öğrencinin
    // o konuda okuyacak hiçbir şeyi kalmıyordu.
    const plan = buildExamScheduleV2({
      daysToExam: 5,
      dailyMinutes: 40,
      studyDays: [1, 2, 3, 4, 5],
      topics: topics(2),
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    const drafts = scheduleSessionsToNodeDrafts(plan.sessions);
    const learn = plan.sessions
      .map((session, i) => ({ session, draft: drafts[i] }))
      .filter(({ session }) => session.role === "learn");
    expect(learn.length).toBeGreaterThan(0);
    for (const { draft } of learn) expect(draft.kind).toBe("lesson");
    expect(drafts.some((d) => d.kind === "podcast")).toBe(false);
  });

  it("estimates higher load for weak/self-hard topics", () => {
    const weak = estimateTopicMinutes({
      id: "1",
      title: "A",
      pageNumbers: [1, 2, 3],
      measuredLevel: "weak",
      selfHard: true,
    });
    const solid = estimateTopicMinutes({
      id: "2",
      title: "B",
      pageNumbers: [1, 2, 3],
      measuredLevel: "solid",
    });
    expect(weak).toBeGreaterThan(solid);
  });
});
