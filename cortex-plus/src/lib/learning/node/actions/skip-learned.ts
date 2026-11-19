/**
 * `action: "skip-learned"` (Faz 4 madde 3.4): konusu "Öğrendin" olan tekrar adımı 0 kredi ile atlanır. Kredi ayrılmaz,
 * model çağrılmaz, kavrama kanıtı yazılmaz. Adım tek öğeli bitişle (1/1, sorusuz podcast gibi puan sayılmaz) kapanır;
 * sıradaki adımı tamamlama fonksiyonu açar.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { canSkipLearnedStep, learnedTopicForNode } from "@/lib/learning/learned-skip";
import type { NodeContext } from "@/lib/learning/node/context";

export async function skipLearnedAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, prepId, nodeId, node, kind, topicLabel, prep, topic } = context;
  const status = String(node.status ?? "");
  if (!canSkipLearnedStep({ kind, status, badge: "learned" })) return errorResponse(409, "skip_not_allowed");
  const target = typeof prep.target_score === "number" ? prep.target_score : null;
  const learned = await learnedTopicForNode(service, { userId, prepId, topicLabel, targetScore: target });
  if (!learned) return errorResponse(409, "topic_not_learned");

  const attemptId = randomUUID();
  const { error: insertError } = await service.from("exam_prep_node_attempts").insert({
    id: attemptId,
    user_id: userId,
    exam_prep_id: prepId,
    node_id: nodeId,
    topic_id: topic?.id ?? null,
    difficulty: "orta",
    voice_mode: false,
    status: "active",
    total: 1,
    payload: { type: "skipped", skipped: "learned", topicLabel },
    generation_id: randomUUID(),
    content_version: 1,
    updated_at: new Date().toISOString(),
  });
  if (insertError) {
    console.error("learned_skip_attempt_failed", { nodeId, message: insertError.message });
    return errorResponse(503, "skip_failed");
  }
  const { data: completed, error: completeError } = await service.rpc("complete_exam_prep_node", {
    p_user_id: userId,
    p_prep_id: prepId,
    p_node_id: nodeId,
    p_attempt_id: attemptId,
    p_score: 1,
    p_total: 1,
    p_answers: {},
  });
  if (completeError || !completed) {
    console.error("learned_skip_complete_failed", { nodeId, message: completeError?.message ?? "empty" });
    return errorResponse(503, "skip_failed");
  }
  const nextId = (completed as { nextId?: string | null }).nextId ?? null;
  return NextResponse.json({ ok: true, skipped: true, nextId, creditsCharged: 0 });
}
