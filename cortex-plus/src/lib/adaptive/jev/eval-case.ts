/**
 * Sanitized decision cases for a later offline Jev vs OpenAI comparison.
 * No names, emails, documents, or chat history.
 */

export type SanitizedEvalSnapshot = {
  stateHash: string;
  candidateActions: string[];
  state: {
    exam_days_remaining: number;
    session_minutes_remaining: number;
    topic_id: string;
    mastery: number;
    mastery_confidence: number;
    recent_accuracy: number | null;
    evidence_count: number;
    independent_evidence: number | null;
    last_result: boolean | null;
    hint_dependency: number;
    repeated_misconception: boolean;
    prerequisite_status: string;
    behind_schedule: boolean;
    review_due: boolean;
  };
  modelDecision: {
    provider: string;
    action: string;
    confidence: number;
    reasonCodes: string[];
  };
};

export function sanitizedEvalSnapshot(input: {
  stateHash: string;
  state: {
    student: {
      exam_days_remaining: number;
      session_minutes_remaining: number;
    };
    objective: {
      topic_id: string;
      mastery: number;
      mastery_confidence: number;
      recent_accuracy: number | null;
      attempt_count: number;
      independent_evidence?: number;
    };
    evidence: {
      last_answer_correct: boolean | null;
      hint_count: number;
      repeated_misconception: boolean;
      prerequisite_status?: string;
    };
    plan: { behind_schedule: boolean; review_due?: boolean };
    allowed_actions: string[];
  };
  provider: string;
  action: string;
  confidence: number;
  reasonCodes?: string[];
}): SanitizedEvalSnapshot {
  return {
    stateHash: input.stateHash,
    candidateActions: input.state.allowed_actions,
    state: {
      exam_days_remaining: input.state.student.exam_days_remaining,
      session_minutes_remaining: input.state.student.session_minutes_remaining,
      topic_id: input.state.objective.topic_id,
      mastery: input.state.objective.mastery,
      mastery_confidence: input.state.objective.mastery_confidence,
      recent_accuracy: input.state.objective.recent_accuracy,
      evidence_count: input.state.objective.attempt_count,
      independent_evidence: input.state.objective.independent_evidence ?? null,
      last_result: input.state.evidence.last_answer_correct,
      hint_dependency: input.state.evidence.hint_count,
      repeated_misconception: input.state.evidence.repeated_misconception,
      prerequisite_status: input.state.evidence.prerequisite_status ?? "met",
      behind_schedule: input.state.plan.behind_schedule,
      review_due: input.state.plan.review_due === true,
    },
    modelDecision: {
      provider: input.provider,
      action: input.action,
      confidence: input.confidence,
      reasonCodes: input.reasonCodes ?? [],
    },
  };
}

export type DecisionComparisonCase = {
  openaiAction: string;
  jevAction: string;
  policyValid: boolean;
  interventionSuccess: boolean | null;
  latencyMs: number;
  costUsd: number;
};

export type DecisionComparisonScore = {
  agreementRate: number;
  policyValidRate: number;
  interventionSuccessRate: number | null;
  meanLatencyMs: number;
  meanCostUsd: number;
  disagreements: number;
};

/** Offline score only. Does not call a provider or change production traffic. */
export function scoreDecisionAgreement(
  cases: DecisionComparisonCase[],
): DecisionComparisonScore {
  const n = cases.length;
  if (!n) {
    return {
      agreementRate: 0,
      policyValidRate: 0,
      interventionSuccessRate: null,
      meanLatencyMs: 0,
      meanCostUsd: 0,
      disagreements: 0,
    };
  }
  const agreements = cases.filter((c) => c.openaiAction === c.jevAction).length;
  const valid = cases.filter((c) => c.policyValid).length;
  const judged = cases.filter((c) => c.interventionSuccess != null);
  const successes = judged.filter((c) => c.interventionSuccess === true).length;
  return {
    agreementRate: agreements / n,
    policyValidRate: valid / n,
    interventionSuccessRate: judged.length ? successes / judged.length : null,
    meanLatencyMs: cases.reduce((sum, c) => sum + c.latencyMs, 0) / n,
    meanCostUsd: cases.reduce((sum, c) => sum + c.costUsd, 0) / n,
    disagreements: n - agreements,
  };
}
