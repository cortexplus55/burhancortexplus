/** Üretimden önce kayıt (`creating`) ve sabit kredi anahtarı; önceden yazımda düğüm sahiplenilir. */
import "server-only";
import { NextResponse } from "next/server";
import { claimPrefetchSlot } from "@/lib/learning/lesson-prefetch";
import { tagQuizPrefetchClaim } from "@/lib/learning/topic-test-prefetch";
import { errorResponse } from "@/lib/api/guards";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { creditIdempotencyKeyForSlot, creditIdempotencyKeyForStart, isCreatingStale } from "@/lib/learning/attempt-lifecycle";
import { attemptStartResponse, findAttemptByClientRequest, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function reserveStartAttempt(context: NodeContext, state: Pick<StartLocals, "topic" | "topicLabel" | "title" | "existingForKey" | "variant" | "clientRequestId">) {
  const { userId, service, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, kind, difficulty, voiceMode, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, existingForKey, variant } = state;
  let { clientRequestId } = state;
  // Stage 8: reserve a creating row + stable credit key before model work.
  let generationId: string | undefined;
  let creatingAttemptId: string | undefined;
  let creditKey: string | undefined;

  // Önceden yazım öğrenci kaydı açmaz ve kredi ayırmaz; düğümü sahiplenir.
  if (prefetch) {
    const claimed = await claimPrefetchSlot(service, {
      nodeId,
      prepId,
      userId,
      topicId: topic?.id ?? null,
      familiarity,
    });
    if (!claimed) return NextResponse.json({ ok: true, skipped: "busy" });
    if (kind === "quiz") await tagQuizPrefetchClaim(service, { nodeId, variant });
  }

  if (teachingV2 && !prefetch) {
    if (!clientRequestId) {
      clientRequestId = crypto.randomUUID();
    }
    generationId = crypto.randomUUID();
    creditKey = creditIdempotencyKeyForStart({
      userId,
      nodeId,
      clientRequestId,
    });

    if (existingForKey?.status === "creating") {
      creatingAttemptId = existingForKey.id;
      let claim = service
        .from("exam_prep_node_attempts")
        .update({
          status: "creating",
          generation_id: generationId,
          updated_at: new Date().toISOString(),
          familiarity,
          mood,
          difficulty,
          voice_mode: voiceMode,
        })
        .eq("id", existingForKey.id)
        .eq("status", "creating");
      claim = existingForKey.updated_at
        ? claim.eq("updated_at", existingForKey.updated_at)
        : claim.is("updated_at", null);
      const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
      if (claimError || !claimed) return errorResponse(409, "generation_in_progress");
    } else {
      // Çift sekme / çift tıklama (31 Ekim 2026, Paket J2 #9): bu adım için başka bir istek kayıt açıp yazıyorsa
      // ikincisi beklesin ve birincinin sonucunu açsın (istemci "hazırlanıyor"da kalıp yeniden sorar). Takılı kalmış
      // (bayat) kayıt yeni isteği kilitlemez: "failed" olur. Aynı anda gelen iki istek için veritabanı dizini tek
      // kayda izin verir (göç 20261031190000).
      const twin = await takeOverOrWaitForTwin(context);
      if (twin) return twin;
      const creatingRow = {
        node_id: nodeId,
        exam_prep_id: prepId,
        user_id: userId,
        topic_id: topic?.id ?? null,
        difficulty,
        voice_mode: voiceMode,
        payload: null,
        total: 1,
        status: "creating",
        generation_id: generationId,
        client_request_id: clientRequestId,
        familiarity,
        mood,
        content_version: 1,
        updated_at: new Date().toISOString(),
      };
      let { data: created, error: createErr } = await service
        .from("exam_prep_node_attempts")
        .insert(creatingRow)
        .select("id, generation_id")
        .single();
      if (createErr && (createErr as { code?: string }).code === "23505") {
        const twin = await takeOverOrWaitForTwin(context);
        if (twin) return twin;
      }
      if (createErr) {
        // Unique client_request_id race: re-read and return if ready.
        const raced = await findAttemptByClientRequest(service, {
          userId,
          nodeId,
          clientRequestId,
        });
        if (raced?.payload) {
          return NextResponse.json(
            attemptStartResponse(raced, {
              kind,
              title,
              topicLabel,
              publicPayload: await publicPayloadForUser(service, userId, raced.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
              resumed: true,
            }),
          );
        }
        if (raced) return errorResponse(409, "generation_in_progress");
        ({ data: created, error: createErr } = await service
          .from("exam_prep_node_attempts")
          .insert({
            node_id: nodeId,
            exam_prep_id: prepId,
            user_id: userId,
            topic_id: topic?.id ?? null,
            difficulty,
            voice_mode: voiceMode,
            payload: null,
            total: 1,
            status: "creating",
            generation_id: generationId,
            client_request_id: clientRequestId,
            content_version: 1,
            updated_at: new Date().toISOString(),
          })
          .select("id, generation_id")
          .single());
      }
      if (createErr || !created) return errorResponse(500, "generation_failed");
      creatingAttemptId = created.id;
      generationId = created.generation_id ?? generationId;
      creditKey = creditIdempotencyKeyForSlot({ userId, nodeId, attemptId: created.id });
    }

    await upsertGenerationJob(service, {
      userId,
      prepId,
      nodeId,
      attemptId: creatingAttemptId!,
      clientRequestId,
      generationId: generationId!,
      status: "creating",
      creditKey,
    });
  }
  return { clientRequestId, generationId, creatingAttemptId, creditKey };
}

/**
 * Bu adım için başka bir istekle açılmış "hazırlanıyor" kaydı: tazeyse 409 (`shared: true`, istemci bekler), bayatsa
 * "failed" yapılır ve yeni kayda yol açılır (null).
 */
async function takeOverOrWaitForTwin(context: NodeContext): Promise<NextResponse | null> {
  const { service, userId, nodeId } = context;
  const { data: twin } = await service
    .from("exam_prep_node_attempts")
    .select("id, updated_at")
    .eq("user_id", userId)
    .eq("node_id", nodeId)
    .eq("status", "creating")
    .limit(1)
    .maybeSingle();
  if (!twin) return null;
  if (!isCreatingStale(twin.updated_at as string | null)) {
    return NextResponse.json({ error: "generation_in_progress", code: "generation_in_progress", shared: true }, { status: 409 });
  }
  await service
    .from("exam_prep_node_attempts")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", twin.id as string)
    .eq("status", "creating");
  return null;
}

/** Kayıt aşamasının erken yanıt dışındaki dönüşü. */
export type StartReserved = Exclude<Awaited<ReturnType<typeof reserveStartAttempt>>, Response>;
