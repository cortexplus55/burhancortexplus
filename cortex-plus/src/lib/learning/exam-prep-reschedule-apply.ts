/**
 * Stage 9 — apply redistributed schedule to exam_prep_nodes (keep done, replace rest).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
  type ScheduleBuildResult,
  type ScheduleSession,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { daysUntilExam } from "@/lib/learning/exam-prep-plan";

export type PrepNodeForReschedule = {
  id: string;
  sort_order: number;
  status: string;
  session_meta: unknown;
};

function sessionKey(calendarDate: string, sortOrder: number) {
  return `${calendarDate}:${sortOrder}`;
}

export function completedRefsFromDoneNodes(nodes: PrepNodeForReschedule[]) {
  const refs: { sortOrder: number; calendarDate: string }[] = [];
  for (const node of nodes) {
    if (node.status !== "done") continue;
    const meta =
      node.session_meta && typeof node.session_meta === "object"
        ? (node.session_meta as { calendarDate?: string })
        : null;
    const calendarDate = meta?.calendarDate?.trim();
    if (!calendarDate) continue;
    refs.push({ sortOrder: node.sort_order, calendarDate });
  }
  return refs;
}

export function sessionsToInsert(
  schedule: ScheduleBuildResult,
  doneNodes: PrepNodeForReschedule[],
): ScheduleSession[] {
  const doneKeys = new Set(
    completedRefsFromDoneNodes(doneNodes).map((r) =>
      sessionKey(r.calendarDate, r.sortOrder),
    ),
  );
  return schedule.sessions.filter(
    (s) => !doneKeys.has(sessionKey(s.calendarDate, s.sortOrder)),
  );
}

export async function rebuildPrepSchedule(
  service: SupabaseClient,
  input: {
    prepId: string;
    userId: string;
    examDate: string;
    dailyMinutes: number;
    studyDays: number[];
    topics: ScheduleTopicInput[];
    previous: ScheduleBuildResult;
    nodes: PrepNodeForReschedule[];
  },
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const completed = completedRefsFromDoneNodes(input.nodes);
  const rebuilt = redistributeRemainingSchedule({
    previous: input.previous,
    completed,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    daysToExam: daysUntilExam(input.examDate),
    topics: input.topics,
  });

  const { error: prepErr } = await service
    .from("exam_preps")
    .update({
      daily_minutes: input.dailyMinutes,
      study_days: input.studyDays,
      exam_date: input.examDate,
      schedule_v2: {
        fits: rebuilt.fits,
        availableMinutes: rebuilt.availableMinutes,
        requiredMinutes: rebuilt.requiredMinutes,
        cutTopicIds: rebuilt.cutTopicIds,
        optionsIfTight: rebuilt.optionsIfTight,
        studyDayDates: rebuilt.studyDayDates,
        orderedTopicIds: rebuilt.orderedTopicIds,
        summary: rebuilt.summary,
        sessions: rebuilt.sessions,
      },
    })
    .eq("id", input.prepId)
    .eq("user_id", input.userId);

  if (prepErr) return { ok: false, error: "prep_update_failed" };

  const doneIds = input.nodes.filter((n) => n.status === "done").map((n) => n.id);
  const removable = input.nodes.filter((n) => n.status !== "done").map((n) => n.id);
  if (removable.length) {
    const { error: delErr } = await service
      .from("exam_prep_nodes")
      .delete()
      .in("id", removable)
      .eq("exam_prep_id", input.prepId);
    if (delErr) return { ok: false, error: "node_delete_failed" };
  }

  const toInsert = sessionsToInsert(rebuilt, input.nodes);
  const drafts = scheduleSessionsToNodeDrafts(toInsert);
  if (drafts.length) {
    const rows = drafts.map((d, index) => ({
      exam_prep_id: input.prepId,
      kind: d.kind,
      title: d.title,
      day_index: d.dayIndex,
      sort_order: d.sortOrder,
      status: (doneIds.length === 0 && index === 0
        ? "ready"
        : index === 0
          ? "ready"
          : "locked") as "ready" | "locked",
      session_meta: d.meta,
    }));
    // Only one ready among new batch; if some done exist, first remaining is ready.
    if (rows.length) {
      rows.forEach((r, i) => {
        r.status = i === 0 ? "ready" : "locked";
      });
    }
    const { error: insErr } = await service.from("exam_prep_nodes").insert(rows);
    if (insErr) return { ok: false, error: "node_insert_failed" };
  }

  return { ok: true, summary: rebuilt.summary };
}
