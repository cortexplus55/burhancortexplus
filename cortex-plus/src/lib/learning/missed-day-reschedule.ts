import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildPrepSchedule } from "@/lib/learning/exam-prep-reschedule-apply";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type {
  ScheduleBuildResult,
  ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Dashboard load: geçmiş tarihli ve henüz bitmemiş düğüm varsa schedule'ı yeniden dağıt.
 */
export async function maybeRescheduleMissedDays(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) return;

  const today = istanbulToday();
  const { data: preps } = await service
    .from("exam_preps")
    .select(
      "id, exam_date, daily_minutes, study_days, hard_topics_self, schedule_v2",
    )
    .eq("user_id", userId)
    .not("exam_date", "is", null)
    .not("schedule_v2", "is", null)
    .limit(2);

  for (const prep of preps ?? []) {
    const previous = prep.schedule_v2 as ScheduleBuildResult | null;
    if (!previous?.sessions?.length || !prep.exam_date) continue;

    const { data: nodeRows } = await service
      .from("exam_prep_nodes")
      .select("id, kind, sort_order, status, session_meta")
      .eq("exam_prep_id", prep.id);

    const hasPastPending = (nodeRows ?? []).some((n) => {
      if (n.status === "done") return false;
      const meta =
        n.session_meta && typeof n.session_meta === "object"
          ? (n.session_meta as { calendarDate?: string })
          : null;
      return Boolean(meta?.calendarDate && meta.calendarDate < today);
    });
    if (!hasPastPending) continue;

    const hardSet = new Set(
      (Array.isArray(prep.hard_topics_self)
        ? (prep.hard_topics_self as string[])
        : []
      ).map((t) => t.trim().toLocaleLowerCase("tr")),
    );

    const topicMap = new Map<string, ScheduleTopicInput>();
    for (const s of previous.sessions) {
      topicMap.set(s.topicId, {
        id: s.topicId,
        title: s.topicTitle,
        pageNumbers: s.sourcePages ?? [],
        selfHard: hardSet.has(s.topicTitle.trim().toLocaleLowerCase("tr")),
      });
    }

    try {
      await rebuildPrepSchedule(service, {
        prepId: prep.id as string,
        userId,
        examDate: prep.exam_date as string,
        dailyMinutes:
          typeof prep.daily_minutes === "number" ? prep.daily_minutes : 45,
        studyDays:
          Array.isArray(prep.study_days) && prep.study_days.length
            ? (prep.study_days as number[])
            : [1, 2, 3, 4, 5],
        topics: [...topicMap.values()],
        previous,
        nodes: (nodeRows ?? []).map((n) => ({
          id: n.id as string,
          kind: n.kind as PlanNodeKind,
          sort_order: n.sort_order as number,
          status: n.status as string,
          session_meta: n.session_meta,
        })),
      });
    } catch {
      // Best-effort — dashboard must still render.
    }
  }
}
