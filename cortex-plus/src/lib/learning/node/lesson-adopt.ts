/**
 * Yazımı süren önceden yazılmış ders (18 Ekim 2026): ikinci kez yazılmaz, devralınır. Öğrenci denetlenmiş kısmı
 * hemen görür; kalanı önceden yazım yazdıkça kaydına düşer, kredi yazım bitince kesinleşir.
 */
import "server-only";
import { NextResponse, after } from "next/server";
import { recordOpenTiming } from "@/lib/admin/beta-metrics";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { peekBuildingPrefetch, takePrefetchedLesson } from "@/lib/learning/lesson-prefetch";
import { errorResponse } from "@/lib/api/guards";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { creditIdempotencyKeyForStart } from "@/lib/learning/attempt-lifecycle";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { attemptStartResponse, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { actionForKind, readWalletBalance } from "@/lib/learning/node/shared";
import { saveTopicLesson } from "@/lib/learning/node/lesson-store";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function adoptBuildingLesson(context: NodeContext, state: Pick<StartLocals, "topic" | "topicLabel" | "title" | "refreshTopicQuiz" | "clientRequestId" | "voiceSession" | "freeMeter" | "peekBuildingMs">) {
  const { userId, service, requestStarted, parsed, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, node, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, refreshTopicQuiz, clientRequestId, voiceSession, freeMeter } = state;
  let { peekBuildingMs } = state;
  // Yazımı süren hazır ders (18 Ekim 2026): ikinci kez yazılmaz, devralınır. Öğrenci
  // denetlenmiş kısmı hemen görür; kalanı önceden yazım yazdıkça kaydına düşer.
  if (kind === "lesson" && teachingV2 && !voiceSession && !prefetch && parsed.data.lessonStream === true) {
    const peekStarted = Date.now();
    // Hızlı işlemli öğrenci (Plus, kurucu) kısa bekler: soğuk yazımı ilk kavramı ~14 sn'de yayımlıyor; ısınma normal
    // hızda. Ücretsiz öğrencinin yazımı da normal hızda: başlamış ısınmanın ilk kavramı beklenir (24 Ekim 2026).
    const fastOpen = await fastAllowedFor(service, userId).catch(() => false);
    const building = await peekBuildingPrefetch(service, {
      userId,
      nodeId,
      familiarity,
      waitMs: fastOpen ? 8_000 : 20_000,
      extendForBuild: !fastOpen,
    });
    peekBuildingMs = Date.now() - peekStarted;
    if (building?.status === "building") {
      const requestId = clientRequestId ?? crypto.randomUUID();
      const reservation = await reserveCredits(
        service,
        userId,
        actionForKind(kind),
        `${creditIdempotencyKeyForStart({ userId, nodeId, clientRequestId: requestId })}_prefetched`,
        1,
        { freeMeter },
      );
      if (!reservation.ok) {
        return reservation.reason === "insufficient_credits"
          ? errorResponse(402, refusalCode(reservation))
          : errorResponse(409, "generation_in_progress");
      }
      const { data: adoptedRow, error: adoptError } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? null,
          difficulty,
          voice_mode: false,
          payload: { ...building.payload, adoptedPrefetch: true },
          total: 1,
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
      if (adoptError || !adoptedRow) {
        await refundCredits(service, reservation.reservationId).catch(() => undefined);
        return errorResponse(500, "generation_failed", { refunded: true });
      }
      // Yarış: önceden yazım tam bu arada bittiyse hazır dersi hemen al.
      let served = adoptedRow;
      const finished = await takePrefetchedLesson(service, { userId, nodeId });
      if (finished) {
        const { data: done } = await service
          .from("exam_prep_node_attempts")
          .update({ payload: finished.payload, updated_at: new Date().toISOString() })
          .eq("id", adoptedRow.id)
          .select(
            "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
          )
          .single();
        if (done) served = done;
        await commitCredits(service, reservation.reservationId).catch(() => undefined);
        const topicId = topic?.id ?? finished.topicId;
        if (topicId) await saveTopicLesson(service, { prepId, topicId, payload: finished.payload });
        refreshTopicQuiz(topicId);
      }
      await upsertGenerationJob(service, {
        userId,
        prepId,
        nodeId,
        attemptId: adoptedRow.id as string,
        clientRequestId: requestId,
        generationId: adoptedRow.generation_id as string,
        status: "ready",
      });
      if (topic?.id) await service.from("exam_prep_topics").update({ familiarity }).eq("id", topic.id);
      await service.from("study_session_moods").insert({ user_id: userId, exam_prep_id: prepId, node_id: nodeId, mood });
      if (node.status !== "done") await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
      console.info("lesson_prefetch_adopted", { nodeId, finished: Boolean(finished) });
      // Beta çıkış ölçütü (19 Ekim 2026): açılış süresi günlükten başka yerde de kalsın.
      { const ms = Date.now() - requestStarted; after(() => recordOpenTiming(service, { userId, kind, path: "adopted", ms })); }
      return NextResponse.json({
        ...attemptStartResponse(served, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, served.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: false,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
  }
  return { peekBuildingMs };
}
