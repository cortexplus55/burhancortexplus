/**
 * Jev DecisionProvider — retries are handled inside callJevSystemOne
 * (only for retryable errors, max 1 retry within the time budget).
 */

import "server-only";
import {
  callJevSystemOne,
  defaultJevQuestions,
} from "@/lib/adaptive/jev/client";
import type { JevErrorCode } from "@/lib/adaptive/jev/error-codes";
import { normalizeJevAnswers } from "@/lib/adaptive/jev/normalize";
import { estimateTokenCostUsd } from "@/lib/adaptive/analytics";
import { JEV_QUESTION_SET_VERSION } from "@/lib/adaptive/jev/questions";
import type {
  DecisionProvider,
  DecisionRequest,
} from "@/lib/adaptive/jev/providers/types";
import type { JevDecisionResult } from "@/lib/adaptive/types";

export class JevDecisionProvider implements DecisionProvider {
  readonly name = "jev" as const;

  async decide(request: DecisionRequest): Promise<JevDecisionResult> {
    const allowed = request.state.allowed_actions;
    if (allowed.length < 2) {
      throw new Error("jev_skipped:allowed_actions_lt_2");
    }
    const questions = defaultJevQuestions(allowed);

    const result = await callJevSystemOne({
      state: request.state,
      questions,
    });

    if (!result.ok) {
      const err = new Error(
        `jev_failed:${result.error}:${result.latencyMs}`,
      ) as Error & { jevError?: JevErrorCode; attempts?: number };
      err.jevError = result.error;
      err.attempts = result.attempts;
      throw err;
    }

    const normalized = normalizeJevAnswers(result.raw, {
      allowedActions: allowed,
      provider: "jev",
      latencyMs: result.latencyMs,
    });
    if (!normalized.ok) {
      const err = new Error(
        `jev_failed:invalid_response:${result.latencyMs}`,
      ) as Error & { jevError?: JevErrorCode; attempts?: number };
      err.jevError = "invalid_response";
      err.attempts = result.attempts;
      throw err;
    }

    const costUsd =
      result.gatewayCostUsd ??
      estimateTokenCostUsd(
        result.model,
        result.usage.inputTokens,
        result.usage.outputTokens,
      );

    const decision = normalized.result;
    decision.telemetry = {
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostUsd: costUsd,
      escalated: false,
      escalationReason: null,
    };
    decision.jevUsage = {
      access: result.access,
      model: result.model,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd,
      confidence: decision.confidence,
      questionSetVersion: JEV_QUESTION_SET_VERSION,
    };
    return decision;
  }
}
