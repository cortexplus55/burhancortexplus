import { describe, expect, it } from "vitest";
import { STUDY_PATH_SKELETON } from "@/lib/learning/exam-plan-phases";
import {
  CORE_ORDER,
  buildExamPlan,
  mergeStudyPathTemplate,
  sessionMetaBySortOrder,
  type PlanNodeDraft,
} from "@/lib/learning/exam-prep-plan";
import {
  alignNewSessionSortOrders,
  completedRefsFromDoneNodes,
  replacementPlanForRebuild,
} from "@/lib/learning/exam-prep-reschedule-apply";
import {
  buildExamScheduleV2,
  scheduleSessionsToNodeDrafts,
} from "@/lib/learning/exam-schedule-v2";

describe("study path skeleton", () => {
  it("keeps the same activity kinds for a short and a long calendar", () => {
    const kinds = (days: number) => buildExamPlan(days).map((node) => node.kind);
    expect(kinds(3)).toEqual(kinds(40));
    expect(kinds(3)).toEqual(CORE_ORDER);
    expect(new Set(kinds(3)).size).toBe(CORE_ORDER.length);
  });

  it("names the phases the student sees on the plan", () => {
    expect(STUDY_PATH_SKELETON.map((phase) => phase.title)).toEqual([
      "Bugün başla",
      "Öğren ve Pratik Yap",
      "Aralıklı Tekrar",
      "Bilgi boşluklarını kapat",
      "Yazılı Deneme",
      "Sınav günü",
    ]);
    const labels = STUDY_PATH_SKELETON.flatMap((phase) =>
      phase.items.map((item) => item.label),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Giriş Dersi",
        "Tanı Testi",
        "Podcast Dinle",
        "AI öğretmenle Soru-Cevap",
        "Testler ve Doğru/Yanlış",
        "AI ile Sözlü Deneme",
        "Zayıf nokta",
        "Yazılı deneme",
        "Kartlarla son tekrar",
      ]),
    );
  });

  it("inserts missing activity kinds without dropping scheduled nodes", () => {
    const scheduled: PlanNodeDraft[] = [
      { kind: "lesson", title: "A · Ders", dayIndex: 1, sortOrder: 0 },
      { kind: "quiz", title: "A · Test", dayIndex: 1, sortOrder: 1 },
      { kind: "spaced", title: "A · Tekrar", dayIndex: 2, sortOrder: 2 },
      { kind: "written_exam", title: "Yazılı", dayIndex: 3, sortOrder: 3 },
    ];
    const merged = mergeStudyPathTemplate(scheduled);
    expect(merged.map((node) => node.kind)).toEqual(CORE_ORDER);
    expect(merged[0]).toMatchObject({ kind: "lesson", title: "A · Ders" });
    expect(merged.map((node) => node.sortOrder)).toEqual(
      merged.map((_, index) => index),
    );
    expect(merged.some((node) => node.kind === "podcast" && node.title === "Podcast Dinle")).toBe(
      true,
    );
    expect(merged.some((node) => node.kind === "oral")).toBe(true);
    expect(merged.filter((node) => node.kind === "lesson")).toHaveLength(1);
    expect(merged.some((node) => "meta" in node)).toBe(false);
  });

  it("copies neighbor session meta onto template nodes and keeps them on remap", () => {
    const topic = {
      id: "t1",
      title: "Açı ölçüleri",
      objective: "Açıyı ölçer",
      pageNumbers: [3, 4],
      measuredLevel: "unknown" as const,
    };
    const plan = buildExamScheduleV2({
      daysToExam: 12,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5],
      topics: [topic],
      fromDate: new Date("2026-09-08T12:00:00"),
    });
    const scheduled = scheduleSessionsToNodeDrafts(plan.sessions);
    const merged = mergeStudyPathTemplate(scheduled);
    expect(merged.map((node) => node.kind)).toEqual(CORE_ORDER);

    const donor = (kind: PlanNodeDraft["kind"]) =>
      scheduled.find((node) => node.kind === kind);
    const quiz = donor("quiz");
    const spaced = donor("spaced");
    const written = donor("written_exam");
    expect(quiz?.meta?.sourcePages).toEqual([3, 4]);
    expect(spaced && written).toBeTruthy();

    const podcast = merged.find((node) => node.kind === "podcast");
    const qa = merged.find((node) => node.kind === "qa");
    const oral = merged.find((node) => node.kind === "oral");
    const cards = merged.find((node) => node.kind === "flashcards");
    expect(podcast?.meta).toEqual(quiz?.meta);
    expect(qa?.meta).toEqual(quiz?.meta);
    expect(oral?.meta).toEqual(spaced?.meta);
    expect(cards?.meta).toEqual(written?.meta);
    expect(podcast?.meta?.sourcePages).not.toBe(quiz?.meta?.sourcePages);
    expect(podcast?.meta).toMatchObject({
      topicId: "t1",
      topicTitle: "Açı ölçüleri",
      sourcePages: [3, 4],
      calendarDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(podcast?.meta?.objective).toEqual(quiz?.meta?.objective);
    expect(podcast?.dayIndex).toBe(quiz?.dayIndex);

    const persisted = sessionMetaBySortOrder(merged);
    expect(persisted.size).toBe(merged.length);
    for (const node of merged) {
      expect(persisted.get(node.sortOrder)).toEqual(node.meta);
    }

    const templateNodes = merged.filter(
      (node) => !scheduled.some((base) => base.kind === node.kind),
    );
    const doneRefs = completedRefsFromDoneNodes(
      templateNodes.map((node) => ({
        id: node.kind,
        kind: node.kind,
        sort_order: node.sortOrder,
        status: "done",
        session_meta: node.meta,
      })),
    );
    expect(doneRefs).toHaveLength(templateNodes.length);

    const aligned = alignNewSessionSortOrders(plan.sessions, merged, []);
    const sortBefore = aligned.map((session) => session.sortOrder);
    for (const session of aligned) {
      const node = merged.find(
        (draft) =>
          draft.kind === session.kind &&
          draft.meta?.topicId === session.topicId &&
          draft.meta?.role === session.role &&
          draft.meta?.calendarDate === session.calendarDate,
      );
      expect(node?.sortOrder).toBe(session.sortOrder);
    }

    const podcastNode = merged.find((node) => node.kind === "podcast");
    const rebuilt = buildExamScheduleV2({
      daysToExam: 10,
      dailyMinutes: 50,
      studyDays: [1, 2, 3, 4, 5],
      topics: [topic],
      fromDate: new Date("2026-09-09T12:00:00"),
    });
    const replacement = replacementPlanForRebuild({
      sessions: rebuilt.sessions,
      previousSessions: aligned,
      preservedNodes: [
        {
          kind: "podcast",
          sortOrder: podcastNode?.sortOrder ?? 0,
        },
      ],
      insertSessions: rebuilt.sessions,
    });
    expect(aligned.map((session) => session.sortOrder)).toEqual(sortBefore);
    expect(replacement.drafts.some((node) => node.kind === "podcast")).toBe(false);
    for (const kind of ["qa", "true_false", "oral", "gaps", "flashcards"] as const) {
      const node = replacement.drafts.find((draft) => draft.kind === kind);
      expect(node?.meta?.calendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(node?.meta?.topicId).toBe("t1");
      expect(node?.meta?.sourcePages).toEqual([3, 4]);
    }
    const preservedFloor = podcastNode?.sortOrder ?? 0;
    expect(
      replacement.drafts.every((node) => node.sortOrder > preservedFloor),
    ).toBe(true);
    for (const session of replacement.sessions) {
      const node = replacement.drafts.find(
        (draft) =>
          draft.kind === session.kind &&
          draft.meta?.topicId === session.topicId &&
          draft.meta?.role === session.role &&
          draft.meta?.calendarDate === session.calendarDate,
      );
      expect(node?.sortOrder).toBe(session.sortOrder);
    }
  });
});
