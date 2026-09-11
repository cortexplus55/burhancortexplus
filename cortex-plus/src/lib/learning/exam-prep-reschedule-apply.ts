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
    settings?: { hard_topics_self: string[]; learning_preferences: unknown };
  },
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const { data: attempts, error: attemptsError } = await service
    .from("exam_prep_node_attempts").select("node_id").eq("exam_prep_id", input.prepId);
  if (attemptsError) return { ok: false, error: "attempt_lookup_failed" };
  const startedIds = new Set((attempts ?? []).map((a) => a.node_id));
  const protectedNodes = input.nodes
    .filter((n) => n.status === "done" || startedIds.has(n.id))
    .map((n) => ({ ...n, status: "done" }));
  if (protectedNodes.some((n) => !completedRefsFromDoneNodes([n]).length)) {
    return { ok: false, error: "schedule_metadata_missing" };
  }
  const completed = completedRefsFromDoneNodes(protectedNodes);
  const rebuilt = redistributeRemainingSchedule({
    previous: input.previous,
    completed,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    daysToExam: daysUntilExam(input.examDate),
    topics: input.topics,
  });

  const drafts = scheduleSessionsToNodeDrafts(sessionsToInsert(rebuilt, protectedNodes));
  const { data, error } = await service.rpc("replace_exam_prep_schedule", {
    p_user_id: input.userId, p_prep_id: input.prepId,
    p_expected_schedule: input.previous, p_expected_nodes: input.nodes,
    p_preserved_ids: protectedNodes.map((n) => n.id),
    p_schedule: rebuilt,
    p_settings: { exam_date: input.examDate, daily_minutes: input.dailyMinutes,
      study_days: input.studyDays, ...(input.settings ?? {}) },
    p_nodes: drafts.map((d) => ({ kind: d.kind, title: d.title,
      day_index: d.dayIndex, sort_order: d.sortOrder, session_meta: d.meta })),
  });
  if (error || !data) return { ok: false, error: "schedule_update_failed" };
  return { ok: true, summary: rebuilt.summary };
}
