/**
 * Adaptive analytics events — no PII. Best-effort PostHog if configured.
 * Server path also appends structured counters to logs for pilot KPIs.
 */

export type AdaptiveAnalyticsEvent =
  | "exam_created"
  | "source_uploaded"
  | "exam_graph_ready"
  | "diagnostic_started"
  | "diagnostic_completed"
  | "master_plan_created"
  | "study_session_started"
  | "study_session_completed"
  | "adaptive_intervention"
  | "intervention_success"
  | "intervention_failed"
  | "topic_mastered"
  | "review_completed"
  | "daily_plan_completed"
  | "master_plan_replanned";

/**
 * Intervention success: student fails a concept question → Cortex intervenes →
 * within next N meaningful attempts the student independently answers an
 * equivalent concept correctly.
 */
export const INTERVENTION_SUCCESS_WINDOW = 3;

export type AdaptiveMetricDef = {
  key: string;
  definition: string;
};

export const ADAPTIVE_PILOT_METRICS: AdaptiveMetricDef[] = [
  {
    key: "SESSION_COMPLETION_RATE",
    definition:
      "Completed adaptive sessions / started adaptive sessions (same user-prep window).",
  },
  {
    key: "DAILY_PLAN_COMPLETION_RATE",
    definition:
      "Daily plan items marked done / items scheduled for that plan_date.",
  },
  {
    key: "INTERVENTION_SUCCESS_RATE",
    definition:
      "Interventions where student independently succeeds within N attempts after remediation / interventions started.",
  },
  {
    key: "MASTERY_GAIN_PER_SESSION",
    definition:
      "Sum of topic mastery deltas recorded between session start and complete.",
  },
  {
    key: "REPEATED_MISCONCEPTION_RATE",
    definition:
      "Evidence events with repeatedErrorCount≥2 or misconception_detected / answer_evaluated events.",
  },
  {
    key: "REVIEW_SUCCESS_RATE",
    definition:
      "Scheduled reviews completed with correct result / reviews due that were attempted.",
  },
  {
    key: "JEV_FALLBACK_RATE",
    definition:
      "Real provider failures (openai_fallback, or deterministic with fallback_reason) / all adaptive_jev_decisions. Intentional openai_decision is not a fallback.",
  },
  {
    key: "GPT4O_ESCALATION_RATE",
    definition:
      "ADAPTIVE_* usage with gpt-4o (non-mini) / all adaptive OpenAI usage events.",
  },
  {
    key: "AI_COST_PER_SESSION",
    definition:
      "Estimated USD from adaptive usage tokens attributed to completed sessions.",
  },
  {
    key: "NEXT_ACTION_LATENCY",
    definition:
      "p50/p95 of adaptive_jev_decisions.latency_ms (decision path).",
  },
];

export function trackAdaptiveEvent(
  event: AdaptiveAnalyticsEvent,
  props?: Record<string, string | number | boolean | null>,
): void {
  try {
    if (typeof window === "undefined") return;
    const ph = (
      window as unknown as {
        posthog?: { capture?: (e: string, p?: Record<string, unknown>) => void };
      }
    ).posthog;
    ph?.capture?.(event, { source: "adaptive", ...props });
  } catch {
    // never throw
  }
}

/** Server-safe fire-and-forget (logs + optional PostHog via console structured). */
export function trackAdaptiveEventServer(
  event: AdaptiveAnalyticsEvent,
  props?: Record<string, string | number | boolean | null>,
): void {
  try {
    console.info(
      JSON.stringify({
        source: "adaptive_analytics",
        event,
        ...props,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // never throw
  }
}

/** Published list rates used for pilot estimates. gpt-4o vs gpt-4o-mini. */
export function estimateTokenCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const m = model.toLowerCase();
  const is4o = m.includes("gpt-4o") && !m.includes("mini");
  const inRate = is4o ? 2.5 / 1e6 : 0.15 / 1e6;
  const outRate = is4o ? 10 / 1e6 : 0.6 / 1e6;
  return tokensIn * inRate + tokensOut * outRate;
}

export function isAdvancedDecisionModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes("gpt-4o") && !m.includes("mini");
}

const DECISION_USAGE_CODES = new Set([
  "ADAPTIVE_DECISION",
  "ADAPTIVE_DECISION_ESCALATION",
  "ADAPTIVE_DECISION_FALLBACK",
  "ADAPTIVE_JEV",
]);

const CONTENT_USAGE_CODES = new Set([
  "ADAPTIVE_ACTION_CONTENT",
  "ADAPTIVE_ANSWER_EVAL",
]);

export type SessionUsageSlice = {
  actionCode: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
};

export type SessionCostWindow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
};

export type SessionAiCost = {
  sessionId: string;
  miniDecisionTokens: number;
  escalationTokens: number;
  contentTokens: number;
  decisionCostUsd: number;
  contentCostUsd: number;
  totalUsd: number;
};

/**
 * Attribute usage rows to sessions by timestamp. ai_usage_events has no session id.
 */
export function sessionAiCostReport(
  sessions: SessionCostWindow[],
  usage: SessionUsageSlice[],
): SessionAiCost[] {
  const ordered = [...sessions].sort(
    (a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  return ordered.map((session, index) => {
    const start = new Date(session.startedAt).getTime();
    const nextStart = ordered[index + 1]
      ? new Date(ordered[index + 1]!.startedAt).getTime()
      : Number.POSITIVE_INFINITY;
    const end = session.endedAt
      ? new Date(session.endedAt).getTime()
      : Math.min(nextStart, start + 6 * 60 * 60 * 1000);

    let miniDecisionTokens = 0;
    let escalationTokens = 0;
    let contentTokens = 0;
    let decisionCostUsd = 0;
    let contentCostUsd = 0;

    for (const row of usage) {
      const at = new Date(row.createdAt).getTime();
      if (at < start || at > end) continue;
      const cost = estimateTokenCostUsd(row.model, row.tokensIn, row.tokensOut);
      const tokens = row.tokensIn + row.tokensOut;
      if (DECISION_USAGE_CODES.has(row.actionCode)) {
        decisionCostUsd += cost;
        if (
          row.actionCode === "ADAPTIVE_DECISION_ESCALATION" ||
          isAdvancedDecisionModel(row.model)
        ) {
          escalationTokens += tokens;
        } else {
          miniDecisionTokens += tokens;
        }
      } else if (CONTENT_USAGE_CODES.has(row.actionCode)) {
        contentCostUsd += cost;
        contentTokens += tokens;
      }
    }

    return {
      sessionId: session.id,
      miniDecisionTokens,
      escalationTokens,
      contentTokens,
      decisionCostUsd,
      contentCostUsd,
      totalUsd: decisionCostUsd + contentCostUsd,
    };
  });
}
