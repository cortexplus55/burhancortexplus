import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { rebuildPrepSchedule } from "@/lib/learning/exam-prep-reschedule-apply";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { prepDailyMinutes, prepStudyDays, type ScheduleBuildResult } from "@/lib/learning/exam-schedule-v2";
import { loadPrepScheduleTopics } from "@/lib/learning/prep-schedule-topics";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  reason: z
    .enum(["missed_days", "time_insufficient", "date_changed", "manual"])
    .default("missed_days"),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "exam-prep-reschedule",
    limit: 12,
  });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    return errorResponse(403, "feature_disabled");
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, exam_date, daily_minutes, study_days, hard_topics_self, schedule_v2",
    )
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return errorResponse(404, "not_found");
  if (!prep.exam_date) return errorResponse(400, "missing_exam_date");

  const previous = prep.schedule_v2 as ScheduleBuildResult | null;
  if (!previous?.sessions?.length) {
    return errorResponse(400, "no_schedule_v2");
  }

  const dailyMinutes = prepDailyMinutes(prep.daily_minutes);
  const studyDays = prepStudyDays(prep.study_days);

  const { data: nodeRows, error: nodesError } = await service
    .from("exam_prep_nodes")
    .select("id, kind, sort_order, status, session_meta")
    .eq("exam_prep_id", prep.id);
  if (nodesError) return errorResponse(503, "node_lookup_failed");

  const topics = await loadPrepScheduleTopics(service, {
    prepId: prep.id,
    previous,
    hardTopics: Array.isArray(prep.hard_topics_self) ? (prep.hard_topics_self as string[]) : [],
  });

  const result = await rebuildPrepSchedule(service, {
    prepId: prep.id,
    userId,
    examDate: prep.exam_date as string,
    dailyMinutes,
    studyDays,
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

  if (!result.ok) return errorResponse(500, result.error);

  return NextResponse.json({
    ok: true,
    reason: parsed.data.reason,
    summary: result.summary,
  });
}
