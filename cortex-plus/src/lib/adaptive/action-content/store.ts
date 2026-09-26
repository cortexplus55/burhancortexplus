/**
 * Persist full ActionContent (incl. grading keys) for a decisionTraceId.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionContent } from "@/lib/adaptive/types";

export async function storeActionContent(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string;
    content: ActionContent;
  },
): Promise<void> {
  await service.from("adaptive_learning_events").insert({
    user_id: input.userId,
    exam_prep_id: input.examPrepId,
    session_id: input.sessionId,
    event_type: "intervention_started",
    topic_key: input.content.topicKey,
    payload: { content: input.content },
    idempotency_key: `content:${input.sessionId}:${input.content.decisionTraceId}`,
  });
}

export async function loadStoredActionContent(
  service: SupabaseClient,
  input: {
    userId: string;
    sessionId: string;
    decisionTraceId: string;
  },
): Promise<ActionContent | null> {
  const { data } = await service
    .from("adaptive_learning_events")
    .select("payload")
    .eq("user_id", input.userId)
    .eq("session_id", input.sessionId)
    .eq("idempotency_key", `content:${input.sessionId}:${input.decisionTraceId}`)
    .maybeSingle();

  if (!data?.payload || typeof data.payload !== "object") return null;
  const content = (data.payload as { content?: ActionContent }).content;
  return content ?? null;
}
