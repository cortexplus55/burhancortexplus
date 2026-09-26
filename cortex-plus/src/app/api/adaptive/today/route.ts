import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { ensureCurrentDailyPlan } from "@/lib/adaptive/daily-planner";
import { loadStudentState } from "@/lib/adaptive/student-state";
import { computeAdaptiveReadiness } from "@/lib/adaptive/readiness";
import { getActiveSession } from "@/lib/adaptive/session-engine";

const querySchema = z.object({
  examPrepId: z.string().uuid(),
});

export async function GET(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-today");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    examPrepId: url.searchParams.get("examPrepId"),
  });
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  const bundle = await loadStudentState(service, userId, parsed.data.examPrepId);
  if (!bundle) return errorResponse(404, "not_found");

  const plan = await ensureCurrentDailyPlan(service, {
    userId,
    examPrepId: parsed.data.examPrepId,
  });

  const importanceByKey = new Map(
    bundle.graph.topics.map((t) => [
      t.topicKey,
      t.importance === "important" ? 1.5 : t.importance === "less" ? 0.6 : 1,
    ]),
  );

  const overdueReviews = plan.items.filter((i) => i.kind === "review").length;

  const readiness = computeAdaptiveReadiness({
    topics: bundle.topics,
    importanceByKey,
    daysRemaining: bundle.global.daysRemaining,
    overdueReviews,
    coveragePct: Math.round(
      (bundle.topics.filter((t) => t.evidenceCount > 0).length /
        Math.max(1, bundle.topics.length)) *
        100,
    ),
    behindSchedule: Boolean(plan.missedDayCount && plan.missedDayCount > 0),
    previousReadinessPct: bundle.global.readinessPct,
  });

  const session = await getActiveSession(
    service,
    userId,
    parsed.data.examPrepId,
  );

  return NextResponse.json({
    ok: true,
    plan,
    readiness,
    forecast: readiness.forecast,
    daysRemaining: bundle.global.daysRemaining,
    activeSessionId: session?.id ?? null,
    rebalanceNotice: plan.rebalanceNotice ?? null,
    startHref: `/deneme-sinavlari/${parsed.data.examPrepId}/oturum`,
  });
}
