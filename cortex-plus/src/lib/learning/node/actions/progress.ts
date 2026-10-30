/** `action: "progress"`: parça parça açılan ders/test ve arkada yazılan dinleme kontrolü yoklaması. */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { isBuilding, isStaleBuild, truncatedPayload } from "@/lib/learning/lesson-build";
import { settledQuizPayload } from "@/lib/learning/quiz-delivery";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { creditIdempotencyKeyForStart } from "@/lib/learning/attempt-lifecycle";
import { settlePendingStart } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "@/lib/learning/node/context";

// Parça parça açılan ders veya test (18 Ekim 2026): yazım sürerken ekran buradan okur.
export async function progressAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, parsed, prepId, nodeId, lessonFormat, prep, topic, kind, topicLabel, lessonReviewCards } = context;
  // Podcast (30 Ekim 2026): oynatıcı bitince arkada yazılan dinleme kontrolünü buradan alır (`checkPending`).
  if (kind !== "lesson" && kind !== "quiz" && kind !== "podcast") return errorResponse(400, "invalid_input");
  const attemptId = parsed.data.attemptId;
  if (!attemptId) return errorResponse(400, "invalid_input");
  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, payload, generation_id, client_request_id")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .eq("exam_prep_id", prepId)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (!attempt?.payload || typeof attempt.payload !== "object") return errorResponse(404, "not_found");
  let stored = attempt.payload as Record<string, unknown>;
  if (isStaleBuild(stored)) {
    if (kind === "quiz") {
      const promised = typeof stored.promised === "number" ? stored.promised : 0;
      const got = Array.isArray(stored.questions) ? stored.questions.length : 0;
      // Söz verilen sayı dolmadan kapanan test öğrenciye bitmiş sınav gibi açılmaz.
      stored =
        promised > 0 && got < promised
          ? { type: "quiz", questions: [], generationFailed: true }
          : settledQuizPayload(stored);
      await service
        .from("exam_prep_node_attempts")
        .update({ payload: stored })
        .eq("id", attempt.id)
        .eq("generation_id", attempt.generation_id as string);
    } else {
    // Yazımı yürüten fonksiyon düştü: ders olduğu kadarıyla kapanır, kredi iade.
    stored = truncatedPayload(stored);
    await service
      .from("exam_prep_node_attempts")
      .update({ payload: stored })
      .eq("id", attempt.id)
      .eq("generation_id", attempt.generation_id as string);
    if (attempt.client_request_id) {
      const key = creditIdempotencyKeyForStart({ userId, nodeId, clientRequestId: attempt.client_request_id as string });
      const adoptedKey = (attempt.payload as { adoptedPrefetch?: unknown }).adoptedPrefetch === true;
      await settlePendingStart(service, { userId, key: adoptedKey ? `${key}_prefetched` : key, outcome: "refund" });
    }
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "generation",
      reason: "build_stalled",
      reasons: ["yazım ilerlemedi; ders olduğu kadarıyla kapandı"],
    });
    }
  }
  return NextResponse.json({
    ok: true,
    building: isBuilding(stored),
    payload: await publicPayloadForUser(service, userId, stored, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
  });
}
