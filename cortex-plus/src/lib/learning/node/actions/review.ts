/** `action: "review"`: bitmiş yazılı denemenin kayıtlı incelemesi (üretim ve kredi yok). */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { writtenReviewForPayload } from "@/lib/learning/node/written-review";
import type { NodeContext } from "@/lib/learning/node/context";

export async function reviewAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, prepId, nodeId, kind, topicLabel } = context;
  if (kind !== "written_exam") return errorResponse(400, "invalid_input");
  const { data: done } = await service
    .from("exam_prep_node_attempts")
    .select("id, payload, answers, score, total")
    .eq("node_id", nodeId)
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!done) return NextResponse.json({ ok: true, review: null });
  const review = await writtenReviewForPayload(service, {
    userId,
    prepId,
    attemptId: done.id as string,
    nodeId,
    payload: done.payload,
    answers: (done.answers as Record<string, unknown> | null) ?? {},
    topicLabel,
    allowFill: false,
  });
  return NextResponse.json({
    ok: true,
    review,
    score: done.score ?? review?.score ?? 0,
    total: done.total ?? review?.total ?? 1,
  });
}
