/** "Dersi tekrarla" ve "Tekrar incele": kayıtlı gövde yeni bir denemede açılır (anında, kredisiz). */
import "server-only";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { savedReviewPayload } from "@/lib/learning/saved-review";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { attemptStartResponse, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { countTotal, readWalletBalance } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function reopenSavedAttempt(context: NodeContext, state: Pick<StartLocals, "topic" | "topicLabel" | "title" | "clientRequestId" | "voiceSession">) {
  const { userId, service, parsed, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, clientRequestId, voiceSession } = state;
  // "Dersi tekrarla" (18 Ekim 2026) ve "Tekrar incele" (25 Ekim 2026): kayıtlı gövde
  // yeni bir denemede açılır — anında, kredisiz. Kayıt yoksa inceleme üretim başlatmaz.
  const reopenSaved = parsed.data.review === true && !voiceSession && !prefetch && kind !== "written_exam";
  const replayLesson = kind === "lesson" && teachingV2 && !voiceSession && !prefetch && parsed.data.replay === true;
  if (reopenSaved || replayLesson) {
    const { data: previous } = await service
      .from("exam_prep_node_attempts")
      .select("payload")
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .in("status", ["completed", "active"])
      .order("created_at", { ascending: false })
      .limit(5);
    const requestId = clientRequestId ?? crypto.randomUUID();
    const replayed = (previous ?? [])
      .map((row) => savedReviewPayload(row.payload, requestId))
      .find((item): item is Record<string, unknown> => Boolean(item));
    if (replayed) {
      const { data: replayAttempt, error: replayError } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? null,
          difficulty,
          voice_mode: false,
          payload: replayed,
          total: countTotal(kind, replayed),
          status: "active",
          generation_id: crypto.randomUUID(),
          client_request_id: requestId,
          familiarity,
          mood,
          content_version: 1,
          updated_at: new Date().toISOString(),
        })
        .select(
          "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
        )
        .single();
      if (!replayError && replayAttempt) {
        await upsertGenerationJob(service, {
          userId,
          prepId,
          nodeId,
          attemptId: replayAttempt.id as string,
          clientRequestId: requestId,
          generationId: replayAttempt.generation_id as string,
          status: "ready",
        });
        await service.from("study_session_moods").insert({ user_id: userId, exam_prep_id: prepId, node_id: nodeId, mood });
        console.info("lesson_replayed", { nodeId });
        return NextResponse.json({
          ...attemptStartResponse(replayAttempt, {
            kind,
            title,
            topicLabel,
            publicPayload: await publicPayloadForUser(service, userId, replayed, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
            resumed: false,
          }),
          ...(await readWalletBalance(service, userId)),
        });
      }
    }
    if (reopenSaved) return errorResponse(404, "not_found");
  }
  return null;
}
