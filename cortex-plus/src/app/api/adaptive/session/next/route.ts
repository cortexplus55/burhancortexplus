import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { nextAction, toStudentActionPayload } from "@/lib/adaptive/learning-governor";
import { getActiveSession } from "@/lib/adaptive/session-engine";
import { trackAdaptiveEventServer } from "@/lib/adaptive/analytics";

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  sessionMinutesRemaining: z.number().min(0).max(480).optional(),
  lastAnswerCorrect: z.boolean().nullable().optional(),
  hintCount: z.number().int().min(0).max(20).optional(),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-session-next");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  let sessionId = parsed.data.sessionId ?? null;
  if (!sessionId) {
    const active = await getActiveSession(
      service,
      userId,
      parsed.data.examPrepId,
    );
    sessionId = active?.id ?? null;
  }

  const action = await nextAction(
    service,
    userId,
    parsed.data.examPrepId,
    sessionId,
    {
      sessionMinutesRemaining: parsed.data.sessionMinutesRemaining,
      lastAnswerCorrect: parsed.data.lastAnswerCorrect,
      hintCount: parsed.data.hintCount,
    },
  );

  if (action) {
    trackAdaptiveEventServer("adaptive_intervention", {
      action: action.action,
      reason: action.reasonCode,
      topic: action.topicKey,
    });
  }

  return NextResponse.json({
    ok: true,
    action: action ? toStudentActionPayload(action) : null,
    sessionId,
  });
}
