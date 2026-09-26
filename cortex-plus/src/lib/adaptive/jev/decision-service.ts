/**
 * Decision service — deterministic fast path, then Jev or OpenAI.
 * OpenAI primary is a supported mode. Fallback wording is reserved for real failures.
 * Does NOT charge student credits.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  jevCircuitAllows,
  jevCircuitFailure,
  jevCircuitSuccess,
} from "@/lib/adaptive/jev/circuit-breaker";
import { hashDecisionState } from "@/lib/adaptive/jev/build-decision-state";
import { sanitizedEvalSnapshot } from "@/lib/adaptive/jev/eval-case";
import { deterministicFallback } from "@/lib/adaptive/jev/normalize";
import { shouldAttemptJev } from "@/lib/adaptive/jev/provider-mode";
import { JevDecisionProvider } from "@/lib/adaptive/jev/providers/jev";
import { OpenAIDecisionProvider } from "@/lib/adaptive/jev/providers/openai-fallback";
import type { DecisionRequest } from "@/lib/adaptive/jev/providers/types";
import {
  decisionEscalationReason,
  tryDeterministicFastPath,
} from "@/lib/adaptive/policy-engine";
import {
  ADAPTIVE_POLICY_VERSION,
  type CompactDecisionState,
  type DecisionEscalationHints,
  type JevDecisionResult,
  type LearningAction,
  type TeachingMode,
} from "@/lib/adaptive/types";
import { isFeatureEnabled, JEV_ENABLED_FLAG } from "@/lib/admin/feature-flags";

const CACHE_MS = 60_000;
const inflight = new Map<string, Promise<JevDecisionResult>>();

export type DecideAndAuditInput = DecisionRequest & {
  service: SupabaseClient;
  jevFlagOverride?: boolean;
  hints?: DecisionEscalationHints;
};

export async function decideNextActions(
  input: DecideAndAuditInput,
): Promise<JevDecisionResult> {
  const stateHash = hashDecisionState(input.state);
  const key = `${input.userId}:${input.examPrepId}:${input.sessionId ?? ""}:${stateHash}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = decideUncached(input, stateHash).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

async function decideUncached(
  input: DecideAndAuditInput,
  stateHash: string,
): Promise<JevDecisionResult> {
  const cached = await findRecentDecision(input.service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: input.sessionId ?? null,
    stateHash,
  });
  if (cached) return cached;

  const fast = tryDeterministicFastPath(input.state);
  if (fast) {
    fast.auditId = await auditDecision(input.service, {
      userId: input.userId,
      examPrepId: input.examPrepId,
      sessionId: input.sessionId ?? null,
      stateHash,
      state: input.state,
      result: fast,
    });
    return fast;
  }

  const jevFlag =
    input.jevFlagOverride ??
    ((await isFeatureEnabled(input.service, JEV_ENABLED_FLAG, input.userId)) &&
      env.JEV_ENABLED !== false);
  const selection = shouldAttemptJev({
    mode: env.DECISION_PROVIDER,
    jevEnabledEnv: env.JEV_ENABLED !== false,
    jevFlag,
    hasApiKey: Boolean(env.TYPESAFE_API_KEY?.trim()),
    circuitAllows: jevCircuitAllows(),
  });

  let result: JevDecisionResult | null = null;
  let failureReason: string | null = null;

  if (selection.attempt) {
    try {
      const jev = new JevDecisionProvider();
      result = await jev.decide({
        state: input.state,
        userId: input.userId,
        examPrepId: input.examPrepId,
        sessionId: input.sessionId,
      });
      jevCircuitSuccess();
      try {
        const { recordUsage } = await import("@/lib/credits/service");
        await recordUsage(input.service, {
          userId: input.userId,
          actionCode: "ADAPTIVE_JEV",
          model: "jev",
          tokensIn: 0,
          tokensOut: 0,
        });
      } catch {
        /* telemetry best-effort */
      }
    } catch (err) {
      jevCircuitFailure();
      failureReason =
        err instanceof Error ? err.message.slice(0, 200) : "jev_error";
    }
  } else if (selection.fallbackBecauseCircuit) {
    failureReason = "circuit_open";
  }

  const openaiRole = failureReason ? "fallback" : "primary";
  const fallbackEnabled = env.JEV_FALLBACK_ENABLED !== false;
  if (!result && (openaiRole === "primary" || fallbackEnabled)) {
    try {
      const openai = new OpenAIDecisionProvider();
      result = await openai.decide({
        state: input.state,
        userId: input.userId,
        examPrepId: input.examPrepId,
        sessionId: input.sessionId,
        service: input.service,
        role: openaiRole,
        model: env.OPENAI_STANDARD_MODEL || "gpt-4o-mini",
        fallbackReason: failureReason,
      });
      if (openaiRole === "primary") {
        result = await maybeEscalate(input, result);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message.slice(0, 160) : "openai_error";
      failureReason = failureReason ? `${failureReason};${message}` : message;
    }
  }

  if (!result) {
    result = deterministicFallback(
      input.state.allowed_actions,
      0,
      failureReason ?? "all_providers_failed",
    );
  }

  result.auditId = await auditDecision(input.service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: input.sessionId ?? null,
    stateHash,
    state: input.state,
    result,
  });
  return result;
}

async function maybeEscalate(
  input: DecideAndAuditInput,
  mini: JevDecisionResult,
): Promise<JevDecisionResult> {
  const reason = decisionEscalationReason({
    confidence: mini.confidence,
    repeatedMisconception: input.state.evidence.repeated_misconception,
    misconceptionSeverity: mini.misconceptionSeverity,
    hints: input.hints,
  });
  if (!reason) return mini;
  try {
    const openai = new OpenAIDecisionProvider();
    const escalated = await openai.decide({
      state: input.state,
      userId: input.userId,
      examPrepId: input.examPrepId,
      sessionId: input.sessionId,
      service: input.service,
      role: "primary",
      model: env.OPENAI_ADVANCED_MODEL || "gpt-4o",
      escalationReason: reason,
    });
    escalated.telemetry = {
      model: escalated.telemetry?.model ?? env.OPENAI_ADVANCED_MODEL,
      inputTokens: escalated.telemetry?.inputTokens ?? 0,
      outputTokens: escalated.telemetry?.outputTokens ?? 0,
      estimatedCostUsd: escalated.telemetry?.estimatedCostUsd ?? 0,
      escalated: true,
      escalationReason: reason,
      miniInputTokens: mini.telemetry?.inputTokens,
      miniOutputTokens: mini.telemetry?.outputTokens,
    };
    return escalated;
  } catch {
    mini.telemetry = {
      model: mini.telemetry?.model ?? env.OPENAI_STANDARD_MODEL,
      inputTokens: mini.telemetry?.inputTokens ?? 0,
      outputTokens: mini.telemetry?.outputTokens ?? 0,
      estimatedCostUsd: mini.telemetry?.estimatedCostUsd ?? 0,
      escalated: false,
      escalationReason: reason,
    };
    return mini;
  }
}

type AuditRow = {
  id?: string;
  provider?: string;
  normalized?: Record<string, unknown>;
  confidence?: number | null;
  latency_ms?: number | null;
  fallback_reason?: string | null;
};

async function findRecentDecision(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string | null;
    stateHash: string;
  },
): Promise<JevDecisionResult | null> {
  try {
    const builder = service.from("adaptive_jev_decisions");
    if (typeof builder.select !== "function") return null;
    let query = builder
      .select(
        "id, provider, normalized, confidence, latency_ms, fallback_reason, created_at",
      )
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.examPrepId)
      .eq("state_hash", input.stateHash)
      .gte("created_at", new Date(Date.now() - CACHE_MS).toISOString());
    if (input.sessionId) {
      query = query.eq("session_id", input.sessionId);
    }
    const { data } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? resultFromAudit(data as AuditRow) : null;
  } catch {
    return null;
  }
}

function resultFromAudit(row: AuditRow): JevDecisionResult | null {
  const normalized = row.normalized ?? {};
  const action = normalized.action;
  if (typeof action !== "string" || !row.provider) return null;
  return {
    provider: row.provider as JevDecisionResult["provider"],
    action: action as LearningAction,
    teachingMode: (normalized.teachingMode as TeachingMode) ?? "step_by_step",
    difficulty:
      (normalized.difficulty as JevDecisionResult["difficulty"]) ?? "medium",
    needsPrerequisiteReview: Boolean(normalized.needsPrerequisiteReview),
    readyToAdvance: Boolean(normalized.readyToAdvance),
    needsGpt4o: Boolean(normalized.needsGpt4o),
    needsDailyReplan: Boolean(normalized.needsDailyReplan),
    misconceptionSeverity: Number(normalized.misconceptionSeverity ?? 0),
    modelRecommendation: normalized.needsGpt4o ? "gpt-4o" : "gpt-4o-mini",
    confidence: Number(row.confidence ?? 0.7),
    probabilities: {},
    latencyMs: Number(row.latency_ms ?? 0),
    fallbackReason: row.fallback_reason ?? null,
    auditId: row.id,
    reasonCodes: Array.isArray(normalized.reasonCodes)
      ? (normalized.reasonCodes as string[])
      : undefined,
  };
}

async function auditDecision(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string | null;
    stateHash: string;
    state: CompactDecisionState;
    result: JevDecisionResult;
  },
): Promise<string | undefined> {
  const telemetry = input.result.telemetry;
  const usage = {
    provider_mode: env.DECISION_PROVIDER,
    model: telemetry?.model ?? (input.result.provider === "jev" ? "jev" : null),
    action: input.result.action,
    input_tokens: telemetry?.inputTokens ?? 0,
    output_tokens: telemetry?.outputTokens ?? 0,
    estimated_cost_usd: telemetry?.estimatedCostUsd ?? 0,
    escalated: telemetry?.escalated ?? false,
    escalation_reason: telemetry?.escalationReason ?? null,
    mini_input_tokens: telemetry?.miniInputTokens ?? null,
    mini_output_tokens: telemetry?.miniOutputTokens ?? null,
    policy_overridden: null,
    eval: sanitizedEvalSnapshot({
      stateHash: input.stateHash,
      state: input.state,
      provider: input.result.provider,
      action: input.result.action,
      confidence: input.result.confidence,
      reasonCodes: input.result.reasonCodes,
    }),
  };
  const row = {
    user_id: input.userId,
    exam_prep_id: input.examPrepId,
    session_id: input.sessionId,
    state_hash: input.stateHash,
    policy_version: ADAPTIVE_POLICY_VERSION,
    provider: input.result.provider,
    normalized: {
      action: input.result.action,
      teachingMode: input.result.teachingMode,
      difficulty: input.result.difficulty,
      needsPrerequisiteReview: input.result.needsPrerequisiteReview,
      readyToAdvance: input.result.readyToAdvance,
      needsGpt4o: input.result.needsGpt4o,
      needsDailyReplan: input.result.needsDailyReplan,
      misconceptionSeverity: input.result.misconceptionSeverity,
      reasonCodes: input.result.reasonCodes ?? [],
    },
    confidence: input.result.confidence,
    probabilities: input.result.probabilities,
    latency_ms: input.result.latencyMs,
    usage,
    fallback_reason: input.result.fallbackReason ?? null,
  };
  try {
    const builder = service.from("adaptive_jev_decisions");
    const pending = builder.insert(row);
    if (pending && typeof pending.select === "function") {
      const selected = await pending.select("id").maybeSingle();
      const id = selected?.data?.id;
      return typeof id === "string" ? id : undefined;
    }
    await pending;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function recordPolicyOutcome(
  service: SupabaseClient,
  auditId: string | undefined,
  input: {
    overridden: boolean;
    overrideReason: string | null;
    finalAction: LearningAction;
    teachingMode: TeachingMode;
    decisionTraceId: string;
  },
): Promise<void> {
  if (!auditId) return;
  try {
    const builder = service.from("adaptive_jev_decisions");
    if (
      typeof builder.select !== "function" ||
      typeof builder.update !== "function"
    ) {
      return;
    }
    const { data } = await builder
      .select("usage, normalized")
      .eq("id", auditId)
      .maybeSingle();
    const current = (data ?? {}) as {
      usage?: Record<string, unknown>;
      normalized?: Record<string, unknown>;
    };
    const usage = {
      ...(current.usage ?? {}),
      policy_overridden: input.overridden,
      policy_override_reason: input.overrideReason,
      decision_trace_id: input.decisionTraceId,
      policy_final: {
        action: input.finalAction,
        teachingMode: input.teachingMode,
        overridden: input.overridden,
      },
    };
    await service
      .from("adaptive_jev_decisions")
      .update({
        usage,
        normalized: {
          ...(current.normalized ?? {}),
          policyFinalAction: input.finalAction,
          policyOverridden: input.overridden,
        },
      })
      .eq("id", auditId);
  } catch {
    // Audit must not break the session.
  }
}
