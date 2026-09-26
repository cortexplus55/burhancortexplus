import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { loadStudentState } from "@/lib/adaptive/student-state";
import { computeAdaptiveReadiness } from "@/lib/adaptive/readiness";

const querySchema = z.object({
  examPrepId: z.string().uuid(),
});

export async function GET(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-readiness");
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

  const { count: overdue } = await service
    .from("adaptive_scheduled_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exam_prep_id", parsed.data.examPrepId)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString());

  const importanceByKey = new Map(
    bundle.graph.topics.map((t) => [
      t.topicKey,
      t.importance === "important" ? 1.5 : t.importance === "less" ? 0.6 : 1,
    ]),
  );

  const readiness = computeAdaptiveReadiness({
    topics: bundle.topics,
    importanceByKey,
    daysRemaining: bundle.global.daysRemaining,
    overdueReviews: overdue ?? 0,
    coveragePct: Math.round(
      (bundle.topics.filter((t) => t.evidenceCount > 0).length /
        Math.max(1, bundle.topics.length)) *
        100,
    ),
    behindSchedule: false,
    previousReadinessPct: bundle.global.readinessPct,
  });

  return NextResponse.json({
    ok: true,
    ...readiness,
    topics: bundle.topics.map((t) => ({
      topicKey: t.topicKey,
      mastery: t.mastery,
      confidence: t.masteryConfidence,
      status: t.status,
    })),
    daysRemaining: bundle.global.daysRemaining,
  });
}
