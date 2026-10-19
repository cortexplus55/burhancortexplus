import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildPrepSchedule } from "@/lib/learning/exam-prep-reschedule-apply";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { prepDailyMinutes, prepStudyDays, type ScheduleBuildResult } from "@/lib/learning/exam-schedule-v2";
import { loadPrepScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type ScheduleRefreshReason =
  | "missed_day"
  | "exam_graded"
  | "topic_map_ready"
  | "mastery_updated";

/**
 * Dashboard load: geçmiş tarihli ve henüz bitmemiş düğüm varsa schedule'ı yeniden dağıt.
 *
 * `force` ile çağrıldığında (deneme notu geldi, konu haritası hazır…) kaçırılmış
 * gün şartı aranmaz; kalan oturumlar bugünden sınava yeniden dağıtılır. Bitmiş
 * ve başlanmış düğümlere dokunulmaz (rebuildPrepSchedule korur).
 */
export async function maybeRescheduleMissedDays(
  service: SupabaseClient,
  userId: string,
  options: { force?: boolean; reason?: ScheduleRefreshReason } = {},
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
    if (!hasPastPending && !options.force) continue;

    try {
      const topics = await loadPrepScheduleTopics(service, {
        prepId: prep.id as string,
        previous,
        hardTopics: Array.isArray(prep.hard_topics_self) ? (prep.hard_topics_self as string[]) : [],
      });
      await rebuildPrepSchedule(service, {
        prepId: prep.id as string,
        userId,
        examDate: prep.exam_date as string,
        dailyMinutes: prepDailyMinutes(prep.daily_minutes),
        studyDays: prepStudyDays(prep.study_days),
        topics,
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
