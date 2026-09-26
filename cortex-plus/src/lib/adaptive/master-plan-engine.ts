/**
 * MasterPlanEngine — wraps schedule_v2; versions snapshots; does not own micro-decisions.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rebuildPrepSchedule,
  type PrepNodeForReschedule,
} from "@/lib/learning/exam-prep-reschedule-apply";
import type {
  ScheduleBuildResult,
  ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import {
  shouldReplanMaster,
  type ReplanTrigger,
} from "@/lib/adaptive/replan-policy";

export type MasterPlanRecord = {
  version: number;
  reason: string;
  reasonCopy: string;
  schedule: ScheduleBuildResult | null;
};

export async function getLatestMasterPlan(
  service: SupabaseClient,
  examPrepId: string,
): Promise<MasterPlanRecord | null> {
  const { data } = await service
    .from("adaptive_master_plans")
    .select("version, reason, reason_copy, schedule_snapshot")
    .eq("exam_prep_id", examPrepId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    version: Number(data.version),
    reason: String(data.reason ?? "initial"),
    reasonCopy: String(data.reason_copy ?? ""),
    schedule: (data.schedule_snapshot as ScheduleBuildResult) ?? null,
  };
}

export async function snapshotMasterPlan(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    version: number;
    reason: string;
    reasonCopy: string;
    schedule: ScheduleBuildResult | unknown;
  },
): Promise<void> {
  await service.from("adaptive_master_plans").upsert(
    {
      user_id: input.userId,
      exam_prep_id: input.examPrepId,
      version: input.version,
      reason: input.reason,
      reason_copy: input.reasonCopy,
      schedule_snapshot: input.schedule,
    },
    { onConflict: "exam_prep_id,version" },
  );
  await service
    .from("exam_preps")
    .update({ adaptive_plan_version: input.version })
    .eq("id", input.examPrepId)
    .eq("user_id", input.userId);
}

export const MASTER_REPLAN_COPY: Record<ReplanTrigger, string> = {
  initial: "Sınav programın ilk kez oluşturuldu.",
  exam_date_changed: "Sınav tarihin değiştiği için program güncellendi.",
  target_changed: "Hedefin değiştiği için program yeniden dengelendi.",
  source_scope_changed:
    "Yeni kaynaklar kapsamı değiştirdiği için program güncellendi.",
  missed_days: "Kaçırılan günler kalan günlere yeniden dağıtıldı.",
  behind_schedule:
    "İlerleme plandan geride kaldığı için program sıkılaştırıldı.",
  mastery_assumption_wrong:
    "Ölçülen seviye varsayımlardan farklı çıktı; süreler ayarlandı.",
  availability_changed: "Günlük çalışma süren değiştiği için program yenilendi.",
  manual: "Programını isteğin üzerine güncelledik.",
};

/**
 * Persist a new master plan version after schedule is available.
 * Does not delete prior versions.
 */
export async function commitMasterPlanVersion(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    trigger: ReplanTrigger;
    schedule: ScheduleBuildResult;
    previousVersion: number;
  },
): Promise<MasterPlanRecord> {
  const version = input.previousVersion + 1;
  const reasonCopy = MASTER_REPLAN_COPY[input.trigger] ?? MASTER_REPLAN_COPY.manual;
  await snapshotMasterPlan(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    version,
    reason: input.trigger,
    reasonCopy,
    schedule: input.schedule,
  });
  return {
    version,
    reason: input.trigger,
    reasonCopy,
    schedule: input.schedule,
  };
}

/**
 * Policy-gated replan: rebuild nodes via existing helper, then snapshot version.
 */
export async function maybeReplanMaster(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    triggers: ReplanTrigger[];
    topics: ScheduleTopicInput[];
    examDate: string;
    dailyMinutes: number;
    studyDays: number[];
    nodes: PrepNodeForReschedule[];
    previousSchedule: ScheduleBuildResult;
    previousVersion: number;
    missedDayCount?: number;
    behindBySessions?: number;
  },
): Promise<MasterPlanRecord | null> {
  const allowed = input.triggers.find((t) =>
    shouldReplanMaster({
      trigger: t,
      missedDayCount: input.missedDayCount,
      behindBySessions: input.behindBySessions,
    }),
  );
  if (!allowed) return null;

  const rebuilt = await rebuildPrepSchedule(service, {
    prepId: input.examPrepId,
    userId: input.userId,
    examDate: input.examDate,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    topics: input.topics,
    previous: input.previousSchedule,
    nodes: input.nodes,
  });

  if (!rebuilt.ok) return null;

  // Prefer live schedule_v2 after rebuild for snapshot.
  const { data: prep } = await service
    .from("exam_preps")
    .select("schedule_v2")
    .eq("id", input.examPrepId)
    .maybeSingle();

  const schedule =
    (prep?.schedule_v2 as ScheduleBuildResult | null) ?? input.previousSchedule;

  return commitMasterPlanVersion(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    trigger: allowed,
    schedule,
    previousVersion: input.previousVersion,
  });
}

export { shouldReplanMaster };
