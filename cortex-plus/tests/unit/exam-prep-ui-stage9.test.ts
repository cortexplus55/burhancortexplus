import { describe, expect, it } from "vitest";
import {
  completedRefsFromDoneNodes,
  sessionsToInsert,
} from "@/lib/learning/exam-prep-reschedule-apply";
import type { ScheduleBuildResult } from "@/lib/learning/exam-schedule-v2";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";

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
