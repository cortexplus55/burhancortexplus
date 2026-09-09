import { describe, expect, it } from "vitest";
import {
  completedRefsFromDoneNodes,
  sessionsToInsert,
} from "@/lib/learning/exam-prep-reschedule-apply";
import type { ScheduleBuildResult } from "@/lib/learning/exam-schedule-v2";
import {
  findTodayGroup,
  groupNodesByStudyDay,
  missedIncompleteGroups,
  parseLearningPreferences,
} from "@/lib/learning/exam-prep-ui-path";

describe("exam-prep-ui-path", () => {
  it("groups by calendarDate and marks today", () => {
    const groups = groupNodesByStudyDay(
      [
        {
          id: "a",
          dayIndex: 1,
          status: "done",
          sessionMeta: { calendarDate: "2026-09-08", durationMinutes: 20 },
        },
        {
          id: "b",
          dayIndex: 2,
          status: "ready",
          sessionMeta: { calendarDate: "2026-09-09", durationMinutes: 30 },
        },
        {
          id: "c",
          dayIndex: 2,
          status: "locked",
          sessionMeta: { calendarDate: "2026-09-09", durationMinutes: 15 },
        },
      ],
      new Date(2026, 8, 9),
    );
    expect(groups).toHaveLength(2);
    const today = findTodayGroup(groups);
    expect(today?.nodes).toHaveLength(2);
    expect(today?.totalMinutes).toBe(45);
    expect(missedIncompleteGroups(groups)).toHaveLength(0);
  });

  it("flags past incomplete days for reschedule nudge", () => {
    const groups = groupNodesByStudyDay(
      [
        {
          id: "a",
          dayIndex: 1,
          status: "ready",
          sessionMeta: { calendarDate: "2026-09-07" },
        },
      ],
      new Date(2026, 8, 9),
    );
    expect(missedIncompleteGroups(groups)).toHaveLength(1);
  });

  it("parses learning preferences safely", () => {
    expect(parseLearningPreferences({ style: "examples", pace: "slow" })).toEqual({
      style: "examples",
      pace: "slow",
      notes: undefined,
    });
    expect(parseLearningPreferences(null)).toEqual({});
  });
});

describe("exam-prep-reschedule-apply helpers", () => {
  it("keeps done session keys and inserts the rest", () => {
    const done = completedRefsFromDoneNodes([
      {
        id: "1",
        sort_order: 0,
        status: "done",
        session_meta: { calendarDate: "2026-09-08" },
      },
      {
        id: "2",
        sort_order: 1,
        status: "ready",
        session_meta: { calendarDate: "2026-09-09" },
      },
    ]);
    expect(done).toEqual([{ sortOrder: 0, calendarDate: "2026-09-08" }]);

    const schedule: ScheduleBuildResult = {
      sessions: [
        {
          dayIndex: 1,
          calendarDate: "2026-09-08",
          topicId: "t1",
          topicTitle: "A",
          objective: "o",
          sourcePages: [],
          durationMinutes: 20,
          role: "learn",
          kind: "podcast",
          sortOrder: 0,
        },
        {
          dayIndex: 2,
          calendarDate: "2026-09-10",
          topicId: "t1",
          topicTitle: "A",
          objective: "o",
          sourcePages: [],
          durationMinutes: 20,
          role: "practice",
          kind: "quiz",
          sortOrder: 1,
        },
      ],
      availableMinutes: 100,
      requiredMinutes: 40,
      fits: true,
      cutTopicIds: [],
      optionsIfTight: [],
      orderedTopicIds: ["t1"],
      studyDayDates: ["2026-09-08", "2026-09-10"],
      summary: "ok",
    };

    const insert = sessionsToInsert(schedule, [
      {
        id: "1",
        sort_order: 0,
        status: "done",
        session_meta: { calendarDate: "2026-09-08" },
      },
    ]);
    expect(insert).toHaveLength(1);
    expect(insert[0]?.calendarDate).toBe("2026-09-10");
  });
});
