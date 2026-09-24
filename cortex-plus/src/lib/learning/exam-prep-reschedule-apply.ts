/**
 * Stage 9 — apply redistributed schedule to exam_prep_nodes (keep done, replace rest).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
  type CompletedSessionRef,
  type ScheduleBuildResult,
  type ScheduleSession,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import {
  daysUntilExam,
  withTemplateFillers,
  type PlanNodeDraft,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";

export type PrepNodeForReschedule = {
  id: string;
  kind: PlanNodeKind;
  sort_order: number;
  status: string;
  session_meta: unknown;
};

export function completedRefsFromDoneNodes(nodes: PrepNodeForReschedule[]) {
  const refs: CompletedSessionRef[] = [];
  for (const node of nodes) {
    if (node.status !== "done") continue;
    const meta =
      node.session_meta && typeof node.session_meta === "object"
        ? (node.session_meta as { calendarDate?: string })
        : null;
    const calendarDate = meta?.calendarDate?.trim();
    if (!calendarDate) continue;
    refs.push({
      sortOrder: node.sort_order,
      calendarDate,
      kind: node.kind,
    });
  }
  return refs;
}

export function sessionsToInsert(
  schedule: ScheduleBuildResult,
  doneNodes: PrepNodeForReschedule[],
): ScheduleSession[] {
  return schedule.sessions.filter((session) => {
    return !doneNodes.some((node) => {
      if (node.status !== "done" || node.kind !== session.kind) return false;
      const meta =
        node.session_meta && typeof node.session_meta === "object"
          ? (node.session_meta as { calendarDate?: string })
          : null;
      const calendarDate = meta?.calendarDate?.trim();
      return (
        calendarDate === session.calendarDate &&
        node.sort_order === session.sortOrder
      );
    });
  });
}

function draftMatchesSession(draft: PlanNodeDraft, session: ScheduleSession) {
  const meta = draft.meta;
  if (!meta) return false;
  return (
    draft.kind === session.kind &&
    meta.topicId === session.topicId &&
    meta.role === session.role &&
    meta.calendarDate === session.calendarDate
  );
}

/**
 * Yeni oturumların sort_order değeri, şablon araya girince kayan düğüm
 * sırasına çekilir. Bitmiş oturum nesnelerine dokunulmaz: onlar önceki
 * takvimin referansıdır, beklenen kayıtla aynı kalmalıdır.
 */
export function alignNewSessionSortOrders(
  sessions: ScheduleSession[],
  drafts: PlanNodeDraft[],
  preservedSessions: ScheduleSession[],
): ScheduleSession[] {
  const preserved = new Set(preservedSessions);
  return sessions.map((session) => {
    if (preserved.has(session)) return session;
    const match = drafts.find((draft) => draftMatchesSession(draft, session));
    if (!match || match.sortOrder === session.sortOrder) return session;
    return { ...session, sortOrder: match.sortOrder };
  });
}

/**
 * Yeniden kurulumun yazacağı düğümler ve kaydedilecek oturum sırası.
 * Şablon türleri (podcast, soru-cevap, sözlü, …) komşunun metasıyla
 * geri gelir. Bitmiş tür ikinci kez eklenmez. Yeni satırlar korunmuş
 * düğümlerin sort_order değerinin üstüne konur.
 */
export function replacementPlanForRebuild(input: {
  sessions: ScheduleSession[];
  previousSessions: ScheduleSession[];
  preservedNodes: { kind: PlanNodeKind; sortOrder: number }[];
  insertSessions: ScheduleSession[];
}): { sessions: ScheduleSession[]; drafts: PlanNodeDraft[] } {
  const preservedSessionSort = input.sessions.reduce((max, session) => {
    if (!input.previousSessions.includes(session)) return max;
    return Math.max(max, session.sortOrder);
  }, -1);
  const preservedNodeSort = input.preservedNodes.reduce(
    (max, node) => Math.max(max, node.sortOrder),
    -1,
  );
  const drafts = withTemplateFillers(
    scheduleSessionsToNodeDrafts(input.insertSessions),
    {
      alreadyPresent: input.preservedNodes.map((node) => node.kind),
      sortFloor: Math.max(preservedSessionSort, preservedNodeSort) + 1,
    },
  );
  return {
    drafts,
    sessions: alignNewSessionSortOrders(
      input.sessions,
      drafts,
      input.previousSessions,
    ),
  };
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

  const replacement = replacementPlanForRebuild({
    sessions: rebuilt.sessions,
    previousSessions: input.previous.sessions,
    preservedNodes: protectedNodes.map((node) => ({
      kind: node.kind,
      sortOrder: node.sort_order,
    })),
    insertSessions: sessionsToInsert(rebuilt, protectedNodes),
  });
  const { data, error } = await service.rpc("replace_exam_prep_schedule", {
    p_user_id: input.userId, p_prep_id: input.prepId,
    p_expected_schedule: input.previous,
    // Anlık görüntü id, sıra, durum ve session_meta tutar. `kind` yalnızca
    // şablon türünü ikinci kez eklememek için okunur; karşılaştırma yüküne
    // girerse kayıt her seferinde bayat sayılır.
    p_expected_nodes: input.nodes.map(({ id, sort_order, status, session_meta }) => ({
      id, sort_order, status, session_meta,
    })),
    p_preserved_ids: protectedNodes.map((n) => n.id),
    p_schedule: { ...rebuilt, sessions: replacement.sessions },
    p_settings: { exam_date: input.examDate, daily_minutes: input.dailyMinutes,
      study_days: input.studyDays, ...(input.settings ?? {}) },
    p_nodes: replacement.drafts.map((d) => ({ kind: d.kind, title: d.title,
      day_index: d.dayIndex, sort_order: d.sortOrder, session_meta: d.meta })),
  });
  if (error || !data) return { ok: false, error: "schedule_update_failed" };
  return { ok: true, summary: rebuilt.summary };
}
