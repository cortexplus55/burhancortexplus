/** Hazır önceden yazılmış etkinlik (her hazırlanabilir tür): beklemeden açılır, kredi şimdi düşer. */
import "server-only";
import { NextResponse, after } from "next/server";
import { recordOpenTiming, servedOpenPath } from "@/lib/admin/beta-metrics";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { PREFETCH_KINDS, peekPrefetchedLesson, takePrefetchedLesson, waitForPrefetchReady } from "@/lib/learning/lesson-prefetch";
import { podcastCheckOf, podcastPayloadEpisode } from "@/lib/learning/podcast-check";
import { errorResponse } from "@/lib/api/guards";
import { freezeShownCards } from "@/lib/learning/teaching-standards";
import { writePodcastCache } from "@/lib/learning/podcast-episode";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { creditIdempotencyKeyForStart } from "@/lib/learning/attempt-lifecycle";
import { attemptStartResponse, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { actionForKind, countTotal, readWalletBalance } from "@/lib/learning/node/shared";
import { saveTopicLesson } from "@/lib/learning/node/lesson-store";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

/** Aynı seçimle yazılan önceden yazım sürüyorsa bekleme sınırı (konu testi; 24 Ekim 2026). */
export const PREFETCH_MATCHED_WAIT_MS = 100_000;

export async function servePrefetched(context: NodeContext, state: Pick<StartLocals, "topic" | "topicLabel" | "title" | "refreshTopicQuiz" | "clientRequestId" | "voiceSession" | "freeMeter" | "variant" | "peekBuildingMs">) {
  const { userId, service, requestStarted, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, node, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, refreshTopicQuiz, clientRequestId, voiceSession, freeMeter, variant, peekBuildingMs } = state;
  let prefetchWaitMs = 0;
  if (PREFETCH_KINDS.has(kind) && kind !== "lesson" && teachingV2 && !voiceSession && !prefetch) {
    // Akışsız içerik kayda bütün düşer: yazımı sürüyorsa biraz bekle, ikinci kez yazma. Aynı seçimle yazılan
    // konu testi bitmek üzereyse daha uzun beklenir: sıfırdan yazmak ondan uzun sürer (24 Ekim 2026).
    const waitStarted = Date.now();
    await waitForPrefetchReady(service, { userId, nodeId, maxMs: 30_000, variant, matchedMaxMs: PREFETCH_MATCHED_WAIT_MS });
    prefetchWaitMs = Date.now() - waitStarted;
  }
  if (
    PREFETCH_KINDS.has(kind) &&
    teachingV2 &&
    !voiceSession &&
    !prefetch &&
    (await peekPrefetchedLesson(service, { userId, nodeId, familiarity, variant }))
  ) {
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
    const taken = await takePrefetchedLesson(service, { userId, nodeId });
    if (taken) delete taken.payload.prefetchVariant;
    // Hazır kart destesi de gösterilecek listeyle kayda geçer (`freezeShownCards`).
    if (taken) taken.payload = freezeShownCards(taken.payload, lessonReviewCards);
    if (!taken) {
      // Aynı anda başka bir açılış aldı; bu istek dersi kendisi yazar.
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
    } else {
      const { data: readyAttempt, error: readyErr } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? taken.topicId,
          difficulty,
          voice_mode: false,
          payload: taken.payload,
          total: countTotal(kind, taken.payload),
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
      if (readyErr || !readyAttempt) {
        await refundCredits(service, reservation.reservationId).catch(() => undefined);
        return errorResponse(500, "generation_failed", { refunded: true });
      }
      // Önceden yazım önbellekten gelmiş podcast'se (hazırlığın podcast sayfası aynı konuyu yazmıştı)
      // bedelsiz: soğuk açılışta da önbellek ücret almıyor ve oynatıcı "hakkından düşülmedi" diyor.
      const cachedPodcast = kind === "podcast" && taken.payload.reused === true;
      if (cachedPodcast) await refundCredits(service, reservation.reservationId).catch(() => undefined);
      else await commitCredits(service, reservation.reservationId).catch(() => undefined);
      // 20 Ekim 2026: önceden yazılmış podcast açılıp ücreti alındıktan sonra önbelleğe girer. Önceden
      // hiç girmiyordu; "Yeniden dinle" aynı podcast'i yeniden yazıp yeniden ücret alıyordu. Açılmadan
      // önbelleğe girmez kuralı korunur (yazım `charge !== false` iken, burada açılıştan sonra).
      const servedPodcast = kind === "podcast" && !cachedPodcast ? podcastPayloadEpisode(taken.payload) : null;
      if (servedPodcast) {
        await writePodcastCache(service, { prepId, userId, topicLabel, episode: servedPodcast, check: podcastCheckOf(taken.payload) });
      }
      await upsertGenerationJob(service, {
        userId,
        prepId,
        nodeId,
        attemptId: readyAttempt.id as string,
        clientRequestId: requestId,
        generationId: readyAttempt.generation_id as string,
        status: "ready",
      });
      const topicId = topic?.id ?? taken.topicId;
      if (topicId) {
        if (kind === "lesson") await saveTopicLesson(service, { prepId, topicId, payload: taken.payload });
        if (kind === "lesson") refreshTopicQuiz(topicId);
        await service.from("exam_prep_topics").update({ familiarity }).eq("id", topicId);
      }
      await service.from("study_session_moods").insert({
        user_id: userId,
        exam_prep_id: prepId,
        node_id: nodeId,
        mood,
      });
      if (node.status !== "done") {
        await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
      }
      console.info("prefetch_served", { nodeId, kind });
      {
        const ms = Date.now() - requestStarted;
        // Önceden yazımın bitmesi beklendiyse "hazır" değil, devralınan açılış.
        const path = servedOpenPath(Math.max(peekBuildingMs ?? 0, prefetchWaitMs));
        after(() => recordOpenTiming(service, { userId, kind, path, ms }));
      }
      return NextResponse.json({
        ...attemptStartResponse(readyAttempt, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, taken.payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: false,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
  }
  return null;
}
