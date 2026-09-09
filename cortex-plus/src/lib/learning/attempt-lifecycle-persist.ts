/**
 * Stage 8 — DB helpers for attempt lifecycle (service role).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  creditIdempotencyKeyForStart,
  cursorIndexFromMeta,
  toPublicAttemptState,
} from "@/lib/learning/attempt-lifecycle";

export type AttemptRow = {
  id: string;
  status: string;
  payload: unknown;
  answers: Record<string, unknown> | null;
  answer_meta?: unknown;
  score: number | null;
  total: number | null;
  generation_id: string | null;
  client_request_id: string | null;
  complete_request_id: string | null;
  content_version: number | null;
  updated_at?: string | null;
  difficulty?: string;
  voice_mode?: boolean;
};

export async function findAttemptByClientRequest(
  service: SupabaseClient,
  input: { userId: string; nodeId: string; clientRequestId: string },
): Promise<AttemptRow | null> {
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select(
      "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode",
    )
    .eq("user_id", input.userId)
    .eq("node_id", input.nodeId)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

export async function findResumableAttempt(
  service: SupabaseClient,
  input: { userId: string; prepId: string; nodeId: string },
): Promise<AttemptRow | null> {
  const { data } = await service
    .from("exam_prep_node_attempts")
    .select(
      "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode",
    )
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("node_id", input.nodeId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

export function attemptStartResponse(
  attempt: AttemptRow,
  extras: {
    kind: string;
    title: string;
    topicLabel: string;
    publicPayload: Record<string, unknown>;
    resumed?: boolean;
  },
) {
  return {
    ok: true as const,
    attemptId: attempt.id,
    generationId: attempt.generation_id,
    clientRequestId: attempt.client_request_id,
    contentVersion: attempt.content_version ?? 1,
    state: toPublicAttemptState(attempt.status),
    kind: extras.kind,
    title: extras.title,
    topicLabel: extras.topicLabel,
    voiceMode: Boolean(attempt.voice_mode),
    payload: extras.publicPayload,
    answers: attempt.answers ?? {},
    cursorIndex: cursorIndexFromMeta(attempt.answer_meta, attempt.answers),
    score: attempt.score,
    total: attempt.total,
    resumed: extras.resumed ?? false,
  };
}

export async function upsertGenerationJob(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    nodeId: string;
    attemptId: string;
    clientRequestId: string;
    generationId: string;
    status: "creating" | "ready" | "failed" | "completed";
    errorCode?: string | null;
  },
) {
  const creditKey = creditIdempotencyKeyForStart({
    userId: input.userId,
    nodeId: input.nodeId,
    clientRequestId: input.clientRequestId,
  });
  await service.from("exam_prep_generation_jobs").upsert(
    {
      user_id: input.userId,
      exam_prep_id: input.prepId,
      node_id: input.nodeId,
      attempt_id: input.attemptId,
      client_request_id: input.clientRequestId,
      generation_id: input.generationId,
      credit_idempotency_key: creditKey,
      status: input.status,
      error_code: input.errorCode ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,node_id,client_request_id" },
  );
  return creditKey;
}

export async function saveAnswersRpc(
  service: SupabaseClient,
  input: {
    userId: string;
    attemptId: string;
    generationId: string;
    expectedVersion: number;
    answers: Record<string, unknown>;
    cursorIndex?: number | null;
  },
): Promise<
  | { ok: true; contentVersion: number; generationId: string }
  | { ok: false; code: "stale_generation" | "stale_version" | "attempt_not_active" | "error" }
> {
  const { data, error } = await service.rpc("save_exam_prep_node_answers", {
    p_user_id: input.userId,
    p_attempt_id: input.attemptId,
    p_generation_id: input.generationId,
    p_expected_version: input.expectedVersion,
    p_answers: input.answers,
    p_cursor_index: input.cursorIndex ?? null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("stale_generation")) return { ok: false, code: "stale_generation" };
    if (msg.includes("stale_version")) return { ok: false, code: "stale_version" };
    if (msg.includes("attempt_not_active") || msg.includes("attempt_not_found")) {
      return { ok: false, code: "attempt_not_active" };
    }
    return { ok: false, code: "error" };
  }
  const row = data as { contentVersion?: number; generationId?: string } | null;
  return {
    ok: true,
    contentVersion: row?.contentVersion ?? input.expectedVersion + 1,
    generationId: row?.generationId ?? input.generationId,
  };
}
