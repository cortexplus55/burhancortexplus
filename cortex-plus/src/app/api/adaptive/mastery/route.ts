import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { loadStudentState } from "@/lib/adaptive/student-state";

const querySchema = z.object({
  examPrepId: z.string().uuid(),
});

export async function GET(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-mastery");
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

  return NextResponse.json({
    ok: true,
    global: bundle.global,
    topics: bundle.topics,
  });
}
