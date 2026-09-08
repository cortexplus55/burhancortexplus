/**
 * Stage 7 — additive validation metrics (no PII / no draft dumps).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidationMetrics, ValidationStage } from "@/lib/learning/validation-pipeline";

export type ValidationEventInput = {
  userId: string;
  actionCode: string;
  activityKind?: string | null;
  metrics: ValidationMetrics;
  reservationId?: string | null;
};

/** Structured log always; DB insert best-effort (never throws to callers). */
export async function recordValidationEvent(
  service: SupabaseClient | null,
  input: ValidationEventInput,
): Promise<void> {
  const payload = {
    action_code: input.actionCode,
    activity_kind: input.activityKind ?? null,
    outcome: input.metrics.outcome,
    failed_stage: input.metrics.failedStage,
    failure_codes: input.metrics.failureCodes.slice(0, 24),
    generation_ms: input.metrics.generationMs,
    validation_ms: input.metrics.validationMs,
    stages_ms: input.metrics.stagesMs,
    repair_attempted: input.metrics.repairAttempted,
    recheck_passed: input.metrics.recheckPassed,
    reservation_id: input.reservationId ?? null,
  };

  console.error("ai_validation_event", {
    userIdHash: hashUser(input.userId),
    ...payload,
  });

  if (!service) return;
  try {
    const { error } = await service.from("ai_validation_events").insert({
      user_id: input.userId,
      ...payload,
    });
    if (error) {
      console.error("ai_validation_event_insert_failed", {
        code: error.code,
        message: error.message?.slice(0, 120),
      });
    }
  } catch {
    /* metrics must not break generation */
  }
}

function hashUser(userId: string): string {
  // Short non-reversible-ish token for log correlation (not crypto-secure).
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function metricsFromFailure(input: {
  generationMs: number;
  validationMs: number;
  stagesMs?: Partial<Record<ValidationStage, number>>;
  failedStage: ValidationStage | null;
  failureCodes: string[];
  repairAttempted?: boolean;
  recheckPassed?: boolean | null;
  outcome: ValidationMetrics["outcome"];
}): ValidationMetrics {
  return {
    generationMs: input.generationMs,
    validationMs: input.validationMs,
    stagesMs: input.stagesMs ?? {},
    failedStage: input.failedStage,
    failureCodes: input.failureCodes,
    repairAttempted: input.repairAttempted ?? false,
    recheckPassed: input.recheckPassed ?? null,
    outcome: input.outcome,
  };
}
