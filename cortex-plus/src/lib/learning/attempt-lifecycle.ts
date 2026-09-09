/**
 * Stage 8 — attempt / generation lifecycle helpers (pure).
 * Runtime writes only when pdf_learning_v2 is ON.
 */

export type AttemptLifecycleStatus =
  | "creating"
  | "active"
  | "failed"
  | "completed";

/** Product vocabulary: ready ≡ active (DB legacy name). */
export type PublicAttemptState = "creating" | "ready" | "failed" | "completed";

export function toPublicAttemptState(
  status: string | null | undefined,
): PublicAttemptState {
  if (status === "creating") return "creating";
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  return "ready";
}

export function creditIdempotencyKeyForStart(input: {
  userId: string;
  nodeId: string;
  clientRequestId: string;
}): string {
  return `exam_node_start_${input.userId}_${input.nodeId}_${input.clientRequestId}`;
}

/**
 * Merge persisted answers with the complete payload.
 * Submitted keys win; last-question answers must survive refresh via save.
 */
export function mergeAnswersForScoring(
  saved: Record<string, unknown> | null | undefined,
  submitted: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(saved ?? {}) };
  for (const [key, value] of Object.entries(submitted ?? {})) {
    merged[key] = value;
  }
  return merged;
}

export function stripMetaFromAnswers(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const { __meta: _meta, ...rest } = answers;
  return rest;
}

/** Reject overwrites when generation or version does not match the live attempt. */
export function isStaleWrite(input: {
  attemptGenerationId: string | null | undefined;
  requestGenerationId: string | null | undefined;
  attemptVersion: number;
  expectedVersion: number | null | undefined;
}): boolean {
  if (
    input.requestGenerationId &&
    input.attemptGenerationId &&
    input.requestGenerationId !== input.attemptGenerationId
  ) {
    return true;
  }
  if (
    typeof input.expectedVersion === "number" &&
    input.expectedVersion !== input.attemptVersion
  ) {
    return true;
  }
  return false;
}

export function shouldReuseExistingStart(input: {
  status: string | null | undefined;
  hasPayload: boolean;
}): "return_ready" | "resume_creating" | "reject_failed" | "none" {
  if (input.status === "active" && input.hasPayload) return "return_ready";
  if (input.status === "completed" && input.hasPayload) return "return_ready";
  if (input.status === "creating") return "resume_creating";
  if (input.status === "failed") return "reject_failed";
  return "none";
}

/** Half-finished creating older than this may be retried under the same credit key. */
export const CREATING_STALE_MS = 2 * 60 * 1000;

export function isCreatingStale(
  updatedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t > CREATING_STALE_MS;
}

export function cursorIndexFromMeta(
  answerMeta: unknown,
  answers: Record<string, unknown> | null | undefined,
): number {
  const meta = (answerMeta ?? {}) as { cursorIndex?: unknown };
  if (typeof meta.cursorIndex === "number" && meta.cursorIndex >= 0) {
    return meta.cursorIndex;
  }
  const keys = Object.keys(answers ?? {}).filter((k) => k !== "__meta");
  if (!keys.length) return 0;
  const max = Math.max(
    ...keys.map((k) => {
      const n = Number(k);
      return Number.isFinite(n) ? n : 0;
    }),
  );
  return Math.max(0, max);
}
