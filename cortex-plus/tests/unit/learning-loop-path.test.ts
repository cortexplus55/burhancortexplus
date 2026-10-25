import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildExamScheduleV2,
  practiceActivity,
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { sessionsToInsert } from "@/lib/learning/exam-prep-reschedule-apply";
import { PLAN_NODE_META, mergeStudyPathTemplate, studyPathItemTitle } from "@/lib/learning/exam-prep-plan";
import { PLAN_PHASES } from "@/lib/learning/exam-plan-phases";
import { studyToolById } from "@/lib/learning/study-tools";

/*
  Öğrenme döngüsü, yol (20 Ekim 2026): bitmiş yazılı deneme ikinci kez kurulmaz; adlar kurulmayan
  bir şeyi vaat etmez ("karışık", "zor", "aralıklı").
*/

const topics: ScheduleTopicInput[] = [1, 2, 3].map((i) => ({
  id: `t${i}`,
  title: `Konu ${i}`,
  objective: `Hedef ${i}`,
  pageNumbers: [i, i + 1],
  measuredLevel: "emerging",
}));

describe("bitmiş yazılı deneme yeniden kurulmaz", () => {
  it("sırası kaymış bitmiş deneme (uyarlamalı ekleme) ikinci 'Yazılı deneme' doğurmaz", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 12,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics,
      fromDate: new Date("2026-10-01T12:00:00"),
    });
    const mock = plan.sessions.find((session) => session.role === "mock")!;
    expect(mock).toBeTruthy();
    // Araya bir odaklı pratik girdi: düğümün sırası oturumunkinden bir fazla.
    const doneMock = {
      id: "n-mock",
      kind: "written_exam" as const,
      sort_order: mock.sortOrder + 1,
      status: "done",
      session_meta: { calendarDate: mock.calendarDate },
    };
    const rebuilt = redistributeRemainingSchedule({
      previous: plan,
      completed: [{ sortOrder: doneMock.sort_order, calendarDate: mock.calendarDate, kind: "written_exam" }],
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      daysToExam: 10,
      topics,
      fromDate: new Date("2026-10-03T12:00:00"),
    });
    expect(rebuilt.sessions.filter((session) => session.role === "mock")).toHaveLength(1);
    const inserted = sessionsToInsert(rebuilt, [doneMock]);
    expect(inserted.some((session) => session.kind === "written_exam")).toBe(false);
    expect(scheduleSessionsToNodeDrafts(inserted).some((draft) => draft.kind === "written_exam")).toBe(false);
  });

  it("deneme bitmemişse yeniden kurulumda deneme yine var", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 12,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics,
      fromDate: new Date("2026-10-01T12:00:00"),
    });
    const learn = plan.sessions.find((session) => session.role === "learn")!;
    const rebuilt = redistributeRemainingSchedule({
      previous: plan,
      completed: [{ sortOrder: learn.sortOrder, calendarDate: learn.calendarDate, kind: "lesson" }],
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      daysToExam: 10,
      topics,
      fromDate: new Date("2026-10-03T12:00:00"),
    });
    expect(sessionsToInsert(rebuilt, []).some((session) => session.role === "mock")).toBe(true);
  });
});

describe("dürüst adlar", () => {
  it("ek testler sırasını söyler; karışık ya da zor vaat etmez", () => {
    expect(practiceActivity(1).label).toBe("İkinci test");
    expect(practiceActivity(2).label).toBe("Üçüncü test");
    for (const variant of [0, 1, 2, 3]) {
      const { label, reason } = practiceActivity(variant);
      expect(`${label} ${reason ?? ""}`.toLocaleLowerCase("tr")).not.toMatch(/karışık|zor/);
    }
    // 25 Ekim 2026: varyant düğüme yazılıyor (test motoru başka dilim sorar); yalnız testlerde.
    const plan = buildExamScheduleV2({
      daysToExam: 20,
      dailyMinutes: 90,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: topics.map((topic) => ({ ...topic, examHeavy: true })),
      fromDate: new Date("2026-10-01T12:00:00"),
    });
    const drafts = scheduleSessionsToNodeDrafts(plan.sessions);
    expect(drafts.some((draft) => draft.title.includes("İkinci test"))).toBe(true);
    for (const draft of drafts) {
      if (draft.kind !== "quiz") expect(draft.meta).not.toHaveProperty("practiceVariant");
    }
    expect(drafts.find((draft) => draft.title.includes("İkinci test"))?.meta).toMatchObject({ practiceVariant: 1 });
    expect(drafts.find((draft) => draft.title.includes("Konu testi"))?.meta).toMatchObject({ practiceVariant: 0 });
  });

  it("'Aralıklı tekrar' adımı 'Kartlarla tekrar'; tür adı spaced kalır", () => {
    expect(PLAN_NODE_META.spaced.title).toBe("Kartlarla tekrar");
    expect(studyPathItemTitle("spaced", { topicTitle: "Basınç" })).toBe("Basınç · Kartlarla tekrar");
    expect(PLAN_PHASES.find((phase) => phase.id === "review")?.title).toBe("Kartlarla Tekrar");
    expect(studyToolById("spaced").blurb).toBe("Kartlarla tekrar");
    const plan = buildExamScheduleV2({
      daysToExam: 12,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics,
      fromDate: new Date("2026-10-01T12:00:00"),
    });
    const merged = mergeStudyPathTemplate(scheduleSessionsToNodeDrafts(plan.sessions));
    const spaced = merged.filter((node) => node.kind === "spaced");
    expect(spaced.length).toBeGreaterThan(0);
    for (const node of merged) expect(node.title).not.toMatch(/Aralıklı tekrar/i);
  });

  it("var olan hazırlıkların başlıkları göçle düzelir (yalnız UPDATE)", () => {
    const sql = readFileSync("supabase/migrations/20261020171000_path_labels.sql", "utf8");
    expect(sql).toContain("' · Tekrar testi (karışık)', ' · İkinci test'");
    expect(sql).toContain("' · Zor sorular', ' · Üçüncü test'");
    expect(sql).toContain("' · Aralıklı tekrar', ' · Kartlarla tekrar'");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
    expect(sql).not.toContain("schema_migrations");
  });

  it("yanılgı çözümü göçü yalnız ekler", () => {
    const sql = readFileSync("supabase/migrations/20261020170000_misconception_resolution.sql", "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS resolved_at timestamptz");
    expect(sql).not.toMatch(/DROP POLICY|DROP TABLE|DELETE FROM/i);
    expect(sql).not.toContain("schema_migrations");
  });
});
