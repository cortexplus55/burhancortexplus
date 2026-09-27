/**
 * Decision service — deterministic fast path, then Jev or OpenAI.
 * OpenAI primary is a supported mode. Fallback wording is reserved for real failures.
 * Shadow mode: OpenAI decides for the student; Jev runs after() for audit only.
 * Does NOT charge student credits.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
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
import { resolveJevCredential } from "@/lib/adaptive/jev/access";
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
  type JevUsageMeta,
  type LearningAction,
  type TeachingMode,
} from "@/lib/adaptive/types";
import { isFeatureEnabled, JEV_ENABLED_FLAG } from "@/lib/admin/feature-flags";
import type { JevErrorCode } from "@/lib/adaptive/jev/error-codes";

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

async function resolveHasCredential(): Promise<boolean> {
  const cred = await resolveJevCredential({
    mode: env.JEV_ACCESS,
    typesafeKey: env.TYPESAFE_API_KEY,
    gatewayKey: env.AI_GATEWAY_API_KEY,
    baseUrlOverride: env.JEV_BASE_URL,
    modelOverride: env.JEV_MODEL,
  });
  return cred.access !== null;
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
      env.JEV_ENABLED === true);

  const hasCred = await resolveHasCredential();
  const selection = shouldAttemptJev({
    mode: env.DECISION_PROVIDER,
    jevEnabledEnv: env.JEV_ENABLED === true,
    jevFlag,
    hasJevCredential: hasCred,
    circuitAllows: jevCircuitAllows(),
    allowedActionCount: input.state.allowed_actions.length,
  });

  const shadowMode =
    env.JEV_SHADOW_MODE === true &&
    env.JEV_ENABLED === true &&
    jevFlag &&
    hasCred &&
    env.DECISION_PROVIDER !== "openai";

  // Stage 1 — shadow: OpenAI decides for the student; Jev runs after response.
  if (shadowMode && selection.attempt) {
    return decideWithShadow(input, stateHash);
  }

  let result: JevDecisionResult | null = null;
  let failureReason: string | null = null;
  let jevLowConfidenceMeta: JevUsageMeta | undefined;

  if (selection.attempt) {
    try {
      const jev = new JevDecisionProvider();
      const jevResult = await jev.decide({
        state: input.state,
        userId: input.userId,
        examPrepId: input.examPrepId,
        sessionId: input.sessionId,
      });

      if (jevResult.confidence < env.JEV_MIN_CONFIDENCE) {
        // Low confidence is NOT a failure — do not trip the circuit or count as fallback.
        jevLowConfidenceMeta = {
          ...(jevResult.jevUsage ?? {}),
          lowConfidence: true,
          confidence: jevResult.confidence,
        };
        failureReason = null;
        // Fall through to OpenAI as intentional primary with jev_low_confidence marker.
        result = null;
      } else {
        jevCircuitSuccess();
        result = jevResult;
        try {
          const { recordUsage } = await import("@/lib/credits/service");
          await recordUsage(input.service, {
            userId: input.userId,
            actionCode: "ADAPTIVE_JEV",
            model: jevResult.telemetry?.model ?? jevResult.jevUsage?.model ?? "jev",
            tokensIn: jevResult.telemetry?.inputTokens ?? 0,
            tokensOut: jevResult.telemetry?.outputTokens ?? 0,
          });
        } catch {
          /* telemetry best-effort */
        }
      }
    } catch (err) {
      const jevError =
        err && typeof err === "object" && "jevError" in err
          ? String((err as { jevError?: string }).jevError)
          : undefined;
      jevCircuitFailure((jevError as JevErrorCode) ?? "network");
      failureReason =
        err instanceof Error ? err.message.slice(0, 200) : "jev_error";
    }
  } else if (selection.fallbackBecauseCircuit) {
    failureReason = "circuit_open";
  }

  const openaiRole =
    failureReason || jevLowConfidenceMeta ? "fallback" : "primary";
  // Low-confidence path uses openai_decision (not openai_fallback).
  const openaiProviderName = jevLowConfidenceMeta
    ? ("openai_decision" as const)
    : failureReason
      ? ("openai_fallback" as const)
      : ("openai_decision" as const);

  const fallbackEnabled = env.JEV_FALLBACK_ENABLED !== false;
  if (!result && (openaiRole === "primary" || fallbackEnabled || jevLowConfidenceMeta)) {
    try {
      const openai = new OpenAIDecisionProvider();
      result = await openai.decide({
        state: input.state,
        userId: input.userId,
        examPrepId: input.examPrepId,
        sessionId: input.sessionId,
        service: input.service,
        role: jevLowConfidenceMeta ? "primary" : openaiRole,
        model: env.OPENAI_STANDARD_MODEL || "gpt-4o-mini",
        fallbackReason: jevLowConfidenceMeta ? null : failureReason,
      });
      // Force provider label for low-confidence handoff.
      if (jevLowConfidenceMeta) {
        result.provider = "openai_decision";
        result.fallbackReason = null;
        result.jevUsage = {
          ...jevLowConfidenceMeta,
          lowConfidence: true,
        };
      } else if (openaiProviderName === "openai_fallback") {
        result.provider = "openai_fallback";
      }
      if (result.provider === "openai_decision" || openaiRole === "primary") {
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

async function decideWithShadow(
  input: DecideAndAuditInput,
  stateHash: string,
): Promise<JevDecisionResult> {
  let result: JevDecisionResult;
  try {
    const openai = new OpenAIDecisionProvider();
    result = await openai.decide({
      state: input.state,
      userId: input.userId,
      examPrepId: input.examPrepId,
      sessionId: input.sessionId,
      service: input.service,
      role: "primary",
      model: env.OPENAI_STANDARD_MODEL || "gpt-4o-mini",
    });
    result = await maybeEscalate(input, result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 160) : "openai_error";
    result = deterministicFallback(
      input.state.allowed_actions,
      0,
      message,
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

  const auditId = result.auditId;
  const openaiAction = result.action;
  const service = input.service;
  const state = input.state;
  const userId = input.userId;

  // Jev after the student-facing decision — must not delay the response.
  after(() => {
    void runShadowJev({
      service,
      state,
      userId,
      examPrepId: input.examPrepId,
      sessionId: input.sessionId,
      auditId,
      openaiAction,
    });
  });

  return result;
}

async function runShadowJev(input: {
  service: SupabaseClient;
  state: CompactDecisionState;
  userId: string;
  examPrepId: string;
  sessionId?: string | null;
  auditId?: string;
  openaiAction: LearningAction;
}): Promise<void> {
  try {
    const jev = new JevDecisionProvider();
    const jevResult = await jev.decide({
      state: input.state,
      userId: input.userId,
      examPrepId: input.examPrepId,
      sessionId: input.sessionId ?? undefined,
    });
    jevCircuitSuccess();
    try {
      const { recordUsage } = await import("@/lib/credits/service");
      await recordUsage(input.service, {
        userId: input.userId,
        actionCode: "ADAPTIVE_JEV",
        model: jevResult.telemetry?.model ?? "jev",
        tokensIn: jevResult.telemetry?.inputTokens ?? 0,
        tokensOut: jevResult.telemetry?.outputTokens ?? 0,
      });
    } catch {
      /* best-effort */
    }
    await patchAuditShadow(input.service, input.auditId, {
      action: jevResult.action,
      confidence: jevResult.confidence,
      agree: jevResult.action === input.openaiAction,
      latency_ms: jevResult.latencyMs,
      model: jevResult.telemetry?.model ?? jevResult.jevUsage?.model ?? "jev",
      cost_usd: jevResult.telemetry?.estimatedCostUsd ?? 0,
    });
  } catch (err) {
    const jevError =
      err && typeof err === "object" && "jevError" in err
        ? String((err as { jevError?: string }).jevError)
        : "jev_error";
    jevCircuitFailure(jevError as JevErrorCode);
    await patchAuditShadow(input.service, input.auditId, {
      action: "",
      confidence: 0,
      agree: false,
      latency_ms: 0,
      model: "",
      cost_usd: 0,
      error: jevError,
    });
  }
}

async function patchAuditShadow(
  service: SupabaseClient,
  auditId: string | undefined,
  shadow: NonNullable<JevUsageMeta["shadow"]>,
): Promise<void> {
  if (!auditId) return;
  try {
    const builder = service.from("adaptive_jev_decisions");
    if (typeof builder.select !== "function") return;
    const { data } = await builder
      .select("usage")
      .eq("id", auditId)
      .maybeSingle();
    const current = (data ?? {}) as { usage?: Record<string, unknown> };
    await service
      .from("adaptive_jev_decisions")
      .update({
        usage: {
          ...(current.usage ?? {}),
          jev_shadow: shadow,
        },
      })
      .eq("id", auditId);
  } catch {
    // Shadow must never break the student path.
  }
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
    if (mini.jevUsage) {
      escalated.jevUsage = mini.jevUsage;
    }
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
  const jev = input.result.jevUsage;
  const usage = {
    provider_mode: env.DECISION_PROVIDER,
    model:
      telemetry?.model ??
      jev?.model ??
      (input.result.provider === "jev" ? "jev" : null),
    action: input.result.action,
    input_tokens: telemetry?.inputTokens ?? jev?.inputTokens ?? 0,
    output_tokens: telemetry?.outputTokens ?? jev?.outputTokens ?? 0,
    estimated_cost_usd: telemetry?.estimatedCostUsd ?? jev?.costUsd ?? 0,
    escalated: telemetry?.escalated ?? false,
    escalation_reason: telemetry?.escalationReason ?? null,
    mini_input_tokens: telemetry?.miniInputTokens ?? null,
    mini_output_tokens: telemetry?.miniOutputTokens ?? null,
    policy_overridden: null,
    jev_access: jev?.access ?? null,
    jev_model: jev?.model ?? null,
    jev_latency_ms: jev?.latencyMs ?? null,
    jev_attempts: jev?.attempts ?? null,
    jev_input_tokens: jev?.inputTokens ?? null,
    jev_output_tokens: jev?.outputTokens ?? null,
    jev_cost_usd: jev?.costUsd ?? null,
    jev_error: jev?.error ?? null,
    jev_confidence: jev?.confidence ?? null,
    jev_question_set_version: jev?.questionSetVersion ?? null,
    jev_low_confidence: jev?.lowConfidence === true,
    jev_shadow: jev?.shadow ?? null,
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
