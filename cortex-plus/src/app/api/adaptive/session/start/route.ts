import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { startSession } from "@/lib/adaptive/session-engine";
import { toStudentActionPayload } from "@/lib/adaptive/learning-governor";
import { trackAdaptiveEventServer } from "@/lib/adaptive/analytics";

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  plannedDurationMinutes: z.number().int().min(5).max(240).optional(),
  objective: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-session-start");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  try {
    const result = await startSession(service, {
      userId,
      examPrepId: parsed.data.examPrepId,
      plannedDurationMinutes: parsed.data.plannedDurationMinutes,
      objective: parsed.data.objective,
    });
    trackAdaptiveEventServer("study_session_started", {
      examPrepId: parsed.data.examPrepId,
    });
    return NextResponse.json({
      ok: true,
      session: result.session,
      action: result.action ? toStudentActionPayload(result.action) : null,
    });
  } catch (err) {
    console.error("[adaptive/session/start]", err);
    return errorResponse(500, "generation_failed");
  }
}
