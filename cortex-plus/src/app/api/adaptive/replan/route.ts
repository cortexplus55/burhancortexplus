import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import {
  ADAPTIVE_DAILY_REPLAN_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { ensureDailyPlan, istanbulToday } from "@/lib/adaptive/daily-planner";
import { maybeReplanMaster } from "@/lib/adaptive/master-plan-engine";
import type { ScheduleBuildResult, ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  scope: z.enum(["daily", "master"]).default("daily"),
  reason: z
    .enum([
      "manual",
      "missed_days",
      "behind_schedule",
      "availability_changed",
      "exam_date_changed",
      "source_scope_changed",
    ])
    .default("manual"),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-replan");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, exam_date, daily_minutes, study_days, schedule_v2, adaptive_plan_version",
    )
    .eq("id", parsed.data.examPrepId)
    .maybeSingle();

  if (!prep?.exam_date || !prep.schedule_v2) {
    return errorResponse(400, "invalid_input");
  }

  if (parsed.data.scope === "master") {
    const { data: nodes } = await service
      .from("exam_prep_nodes")
      .select("id, kind, sort_order, status, session_meta")
      .eq("exam_prep_id", parsed.data.examPrepId);

    const previous = prep.schedule_v2 as ScheduleBuildResult;
    const topicMap = new Map<string, ScheduleTopicInput>();
    for (const s of previous.sessions ?? []) {
      topicMap.set(s.topicId, {
        id: s.topicId,
        title: s.topicTitle,
        pageNumbers: s.sourcePages ?? [],
      });
    }

    const record = await maybeReplanMaster(service, {
      userId,
      examPrepId: parsed.data.examPrepId,
      triggers: [parsed.data.reason === "manual" ? "manual" : parsed.data.reason],
      topics: [...topicMap.values()],
      examDate: prep.exam_date as string,
      dailyMinutes: Number(prep.daily_minutes ?? 60),
      studyDays: Array.isArray(prep.study_days)
        ? (prep.study_days as number[])
        : [1, 2, 3, 4, 5],
      nodes: (nodes ?? []).map((n) => ({
        id: n.id as string,
        kind: n.kind as PlanNodeKind,
        sort_order: Number(n.sort_order),
        status: String(n.status),
        session_meta: n.session_meta,
      })),
      previousSchedule: previous,
      previousVersion: Number(prep.adaptive_plan_version ?? 0),
    });

    return NextResponse.json({
      ok: true,
      master: record,
      message: record?.reasonCopy ?? "Program güncellenmedi.",
    });
  }

  const dailyFlag = await isFeatureEnabled(
    service,
    ADAPTIVE_DAILY_REPLAN_FLAG,
    userId,
  );
  if (!dailyFlag && parsed.data.reason !== "manual") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Force rebuild daily by deleting today's plan then ensuring
  await service
    .from("adaptive_daily_plans")
    .update({ status: "superseded" })
    .eq("user_id", userId)
    .eq("exam_prep_id", parsed.data.examPrepId)
    .eq("plan_date", istanbulToday());

  // Unique constraint: delete superseded same-day to allow new insert
  await service
    .from("adaptive_daily_plans")
    .delete()
    .eq("user_id", userId)
    .eq("exam_prep_id", parsed.data.examPrepId)
    .eq("plan_date", istanbulToday());

  const plan = await ensureDailyPlan(service, {
    userId,
    examPrepId: parsed.data.examPrepId,
    schedule: prep.schedule_v2 as ScheduleBuildResult,
    reviewItems: [],
    weakTopics: [],
    dailyMinutesCap:
      typeof prep.daily_minutes === "number" ? prep.daily_minutes : null,
    masterPlanVersion: Number(prep.adaptive_plan_version ?? 0),
  });

  return NextResponse.json({
    ok: true,
    plan,
    message: "Bugünkü programını güncelledik.",
  });
}
