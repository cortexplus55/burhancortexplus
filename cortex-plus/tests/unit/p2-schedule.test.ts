import { describe, expect, it } from "vitest";
import { buildExamScheduleV2, type ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import {
  applyDisplayDates,
  pathDayLabel,
  pathWeekLabel,
  pinDateToFinalWeek,
  sectionWhenLabel,
} from "@/lib/learning/path-dates";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

const topics = (n: number): ScheduleTopicInput[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    title: `Konu ${i + 1}`,
    pageNumbers: [i + 1],
  }));

describe("yol tarih etiketleri", () => {
  const today = "2026-10-26";

  it("yakın günü Bugün ve Yarın diye, uzağı kısa tarihle yazar", () => {
    expect(pathDayLabel("2026-10-26", today)).toBe("Bugün");
    expect(pathDayLabel("2026-10-27", today)).toBe("Yarın");
    expect(pathDayLabel("2026-10-30", today)).toBe("30 Eki");
  });

  it("konu bloğunu hafta aralığıyla yazar", () => {
    expect(pathWeekLabel("2026-10-26", "2026-11-01", "2026-10-26")).toBe("1. Hafta · 26 Eki – 1 Kas");
    expect(sectionWhenLabel(["2026-10-26", "2026-11-01"], "2026-10-26", today)).toBe(
      "1. Hafta · 26 Eki – 1 Kas",
    );
    expect(sectionWhenLabel(["2026-10-26"], "2026-10-26", today)).toBe("Bugün");
  });

  it("tarihsiz düğümleri sırayı bozmadan serer; final son haftadadır", () => {
    const nodes = [
      { id: "a", kind: "lesson" as PlanNodeKind, sortOrder: 0, sessionMeta: { topicTitle: "Hücre" } },
      { id: "b", kind: "quiz" as PlanNodeKind, sortOrder: 1, sessionMeta: { topicTitle: "Hücre" } },
      { id: "c", kind: "written_exam" as PlanNodeKind, sortOrder: 2, sessionMeta: null },
    ];
    const dated = applyDisplayDates(nodes, { origin: "2026-10-26", examDate: "2026-12-06" }) as Array<{
      id: string;
      sessionMeta: { calendarDate?: string } | null;
    }>;
    const day = (id: string) => dated.find((node) => node.id === id)?.sessionMeta?.calendarDate ?? "";
    expect(dated.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(day("a")).toBe("2026-10-26");
    expect(day("c") >= "2026-11-29").toBe(true);
    expect(day("c") <= "2026-12-05").toBe(true);
    expect(pinDateToFinalWeek("2026-10-26", "2026-12-06", 0, 1)).toBe("2026-12-05");
  });

  it("zamanlayıcı denemeyi son çalışma haftasında bırakır ve konu sırasını değiştirmez", () => {
    const built = buildExamScheduleV2({
      topics: topics(4),
      daysToExam: 42,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      fromDate: new Date("2026-10-26T09:00:00+03:00"),
    });
    const titles = built.sessions.filter((session) => session.role === "learn").map((session) => session.topicTitle);
    expect(titles).toEqual(["Konu 1", "Konu 2", "Konu 3", "Konu 4"]);
    const mock = built.sessions.find((session) => session.role === "mock");
    const last = built.studyDayDates[built.studyDayDates.length - 1]!;
    const weekStart = built.studyDayDates[Math.max(0, built.studyDayDates.length - 7)]!;
    expect(mock?.calendarDate! >= weekStart && mock?.calendarDate! <= last).toBe(true);
  });
});
