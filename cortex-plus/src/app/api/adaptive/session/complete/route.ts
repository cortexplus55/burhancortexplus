import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { completeSession } from "@/lib/adaptive/session-engine";

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  sessionId: z.string().uuid(),
  abandoned: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-session-complete");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  const { data: session } = await service
    .from("adaptive_learning_sessions")
    .select("id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return errorResponse(404, "not_found");

  const { summary } = await completeSession(service, {
    userId,
    examPrepId: parsed.data.examPrepId,
    sessionId: parsed.data.sessionId,
    abandoned: parsed.data.abandoned,
  });

  return NextResponse.json({ ok: true, summary });
}
