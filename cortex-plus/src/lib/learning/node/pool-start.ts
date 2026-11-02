/** Havuzdan açılış: model çağrısı yok, kredi ve haftalık ders sayacı düşmez (2 Kasım 2026). */
import "server-only";
import { NextResponse } from "next/server";
import { poolPayload, poolUnitForTopic } from "@/lib/content-pool/serve";
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
  const { userId, service, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, node, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, clientRequestId, voiceSession } = state;
  if (!teachingV2 || voiceSession) return null;
  const payload = await poolPayload(service, { kind, prefs: prep.learning_preferences, topicLabel, title, userId }).catch(() => null);
  if (!payload) return null;
  // Havuzda hazır olan içerik önceden yazılmaz (model maliyeti yok, açılış zaten anında).
  if (prefetch) return NextResponse.json({ ok: true, skipped: "pool" });
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
  await upsertGenerationJob(service, { userId, prepId, nodeId, attemptId: row.id as string, clientRequestId: requestId, generationId: row.generation_id as string, status: "ready" });
  if (kind === "lesson" && topic?.id) await saveTopicLesson(service, { prepId, topicId: topic.id, payload }).catch(() => undefined);
  if (node.status !== "done") await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
  console.info("pool_served", { nodeId, kind, unit: (payload.pool as { unitId: string }).unitId });
  return NextResponse.json({
    ...attemptStartResponse(row, {
      kind,
      title,
      topicLabel,
      publicPayload: await publicPayloadForUser(service, userId, payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
      resumed: false,
    }),
    ...(await readWalletBalance(service, userId)),
  });
}
