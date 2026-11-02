/** `action: "save"`: oturum ortasında cevap kaydı (sürüm denetimli RPC). */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { saveAnswersRpc } from "@/lib/learning/attempt-lifecycle-persist";
import { applyAnswerLocks } from "@/lib/learning/answer-lock";
import type { NodeContext } from "@/lib/learning/node/context";

// --- Stage 8: mid-session answer save (flag ON) ---
export async function saveAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, parsed, teachingV2 } = context;
  if (!teachingV2) return errorResponse(400, "invalid_input");
  const attemptId = parsed.data.attemptId;
  const generationId = parsed.data.generationId;
  const contentVersion = parsed.data.contentVersion;
  if (!attemptId || !generationId || contentVersion == null) {
    return errorResponse(400, "invalid_input");
  }
  // Kilitli sorunun cevabı değişmez (sürüm denetimi araya giren yazımı zaten reddeder).
  const { data: current } = await service
    .from("exam_prep_node_attempts")
    .select("answers")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  const saved = await saveAnswersRpc(service, {
    userId,
    attemptId,
    generationId,
    expectedVersion: contentVersion,
    answers: applyAnswerLocks((current?.answers as Record<string, unknown> | null) ?? {}, parsed.data.answers ?? {}),
    cursorIndex: parsed.data.cursorIndex,
  });
  if (!saved.ok) {
    if (saved.code === "stale_generation" || saved.code === "stale_version") {
      return errorResponse(409, saved.code);
    }
    if (saved.code === "attempt_not_active") {
      return errorResponse(409, "attempt_not_active");
    }
    return errorResponse(503, "save_failed");
  }
  return NextResponse.json({
    ok: true,
    contentVersion: saved.contentVersion,
    generationId: saved.generationId,
  });
}
