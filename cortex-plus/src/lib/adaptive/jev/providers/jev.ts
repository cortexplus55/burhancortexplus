/**
 * Jev DecisionProvider — one retry max, then caller falls back.
 */

import "server-only";
import {
  callJevSystemOne,
  defaultJevQuestions,
} from "@/lib/adaptive/jev/client";
import { normalizeDecisionPayload } from "@/lib/adaptive/jev/normalize";
import type {
  DecisionProvider,
  DecisionRequest,
} from "@/lib/adaptive/jev/providers/types";
import type { JevDecisionResult } from "@/lib/adaptive/types";

export class JevDecisionProvider implements DecisionProvider {
  readonly name = "jev" as const;

  async decide(request: DecisionRequest): Promise<JevDecisionResult> {
    const allowed = request.state.allowed_actions;
    const questions = defaultJevQuestions(allowed);
    let lastError = "unknown";
    let latencyMs = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await callJevSystemOne({
        state: request.state,
        questions,
      });
      latencyMs = result.latencyMs;
      if (result.ok) {
        return normalizeDecisionPayload(result.raw, {
          allowedActions: allowed,
          provider: "jev",
          latencyMs,
        });
      }
      lastError = result.error;
    }

    throw new Error(`jev_failed:${lastError}:${latencyMs}`);
  }
}
