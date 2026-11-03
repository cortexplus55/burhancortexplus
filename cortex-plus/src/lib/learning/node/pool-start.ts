/** Havuzdan açılış: model çağrısı yok, kredi ve haftalık ders sayacı düşmez (2 Kasım 2026). */
import "server-only";
import { after, NextResponse } from "next/server";
import { recordLessonTiming } from "@/lib/admin/beta-metrics";
import { poolPayload, poolUnitForTopic } from "@/lib/content-pool/serve";
import { sharedUnitEnsurer } from "@/lib/content-pool/ensure";
import { supplementScreens, unitSupplement } from "@/lib/content-pool/supplement";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { attemptStartResponse, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { countTotal, readWalletBalance } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import { saveTopicLesson } from "@/lib/learning/node/lesson-store";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

export async function servePoolContent(
  context: NodeContext,
  state: Pick<StartLocals, "topic" | "topicLabel" | "title" | "clientRequestId" | "voiceSession">,
): Promise<NextResponse | null> {
  const { userId, service, requestStarted, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, node, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, clientRequestId, voiceSession } = state;
  if (!teachingV2 || voiceSession) return null;
  // Hazır ünitede arka planda önceden yazım yok (2 Kasım 2026): havuzdaki türler anında açılır; havuzda olmayan
  // türler (ör. Doğru/Yanlış) öğrenci açınca yazılır. Canlıda Doğru/Yanlış önceden yazımı CONTENT_PREFETCH düşürüyordu.
  if (prefetch && poolUnitForTopic(prep.learning_preferences, topicLabel)) return NextResponse.json({ ok: true, skipped: "pool" });
  const payload = await poolPayload(service, { kind, prefs: prep.learning_preferences, topicLabel, title, userId, ensure: sharedUnitEnsurer(service, userId) }).catch(() => null);
  if (!payload) return null;
  // Öğrenci belge eklediyse: havuz dersi kalır, belgenin kapsadığı üniteye "Senin belgenden ek" (bir kez 15 kredi).
  if (kind === "lesson") {
    const unit = poolUnitForTopic(prep.learning_preferences, topicLabel);
    const lesson = payload.lesson as { screens: Record<string, unknown>[] };
    if (unit) {
      const supplement = await unitSupplement(service, {
        userId,
        prepId,
        unit,
        topicLabel,
        lessonOutline: lesson.screens.map((s) => String(s.heading ?? "")).join("\n"),
      }).catch(() => ({ state: "failed" as const }));
      lesson.screens.push(...supplementScreens(supplement, 16 - lesson.screens.length));
      if (supplement.state === "ready") payload.supplement = { charged: supplement.charged, sections: supplement.sections.length };
    }
  }
  const requestId = clientRequestId ?? crypto.randomUUID();
  const { data: row, error } = await service
    .from("exam_prep_node_attempts")
    .insert({
      node_id: nodeId,
      exam_prep_id: prepId,
      user_id: userId,
      topic_id: topic?.id ?? null,
      difficulty,
      voice_mode: false,
      payload,
      total: countTotal(kind, payload),
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
  if (error || !row) return null;
  // Paket 1b: üç bağımsız yazım paralel (sırayla ~3 gidiş-dönüş ekliyordu).
  await Promise.all([
    upsertGenerationJob(service, { userId, prepId, nodeId, attemptId: row.id as string, clientRequestId: requestId, generationId: row.generation_id as string, status: "ready" }),
    kind === "lesson" && topic?.id ? saveTopicLesson(service, { prepId, topicId: topic.id, payload }).catch(() => undefined) : null,
    node.status !== "done" ? service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).then(() => undefined) : null,
  ]);
  console.info("pool_served", { nodeId, kind, unit: (payload.pool as { unitId: string }).unitId });
  {
    const ms = Date.now() - requestStarted;
    const unitId = (payload.pool as { unitId: string }).unitId;
    after(() => recordLessonTiming(service, { userId, kind, path: "pool", openMs: ms, meta: { unitId } }));
  }
  const [publicPayload, wallet] = await Promise.all([
    publicPayloadForUser(service, userId, payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
    readWalletBalance(service, userId),
  ]);
  return NextResponse.json({
    ...attemptStartResponse(row, { kind, title, topicLabel, publicPayload, resumed: false }),
    ...wallet,
  });
}
