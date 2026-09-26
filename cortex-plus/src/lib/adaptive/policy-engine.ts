/**
 * PolicyEngine — deterministic guards. AI recommends; code governs.
 */

import { ADVANCE_V1, JEV_CONFIDENCE_V1 } from "@/lib/adaptive/config/mastery-v1";
import { prerequisitesMet, type ExamGraph } from "@/lib/adaptive/exam-graph";
import type {
  CompactDecisionState,
  DecisionEscalationHints,
  DecisionEscalationReason,
  DifficultyLevel,
  JevDecisionResult,
  LearningAction,
  TeachingMode,
  TopicMasteryState,
} from "@/lib/adaptive/types";

export type AdvanceCheck = {
  allowed: boolean;
  reasons: string[];
};

export function canAdvanceTopic(input: {
  topic: TopicMasteryState;
  independentCount?: number;
  mediumOrHardCorrect?: number;
  graph: ExamGraph;
  masteryByKey: Map<string, { mastery: number; status: string }>;
}): AdvanceCheck {
  const reasons: string[] = [];
  const t = input.topic;
  if (t.mastery < ADVANCE_V1.masteryMin) {
    reasons.push("mastery_below_threshold");
  }
  if (t.masteryConfidence < ADVANCE_V1.confidenceMin) {
    reasons.push("confidence_below_threshold");
  }
  if (t.evidenceCount < ADVANCE_V1.minEvidence) {
    reasons.push("insufficient_evidence");
  }
  const independent =
    input.independentCount ??
    Math.round((t.independentAccuracy ?? 0) * t.evidenceCount);
  if (independent < ADVANCE_V1.minIndependent) {
    reasons.push("insufficient_independent");
  }
  if (input.mediumOrHardCorrect != null) {
    if (input.mediumOrHardCorrect < ADVANCE_V1.minMediumOrHard) {
      if (t.evidenceCount >= ADVANCE_V1.minEvidence) {
        reasons.push("need_medium_or_hard_success");
      }
    }
  }
  if (!prerequisitesMet(input.graph, t.topicKey, input.masteryByKey)) {
    reasons.push("prerequisite_unmet");
  }
  return { allowed: reasons.length === 0, reasons };
}

/** Escalation ladder when the same action+topic repeats without progress. */
export const ANTI_LOOP_ESCALATION: LearningAction[] = [
  "reteach",
  "worked_example",
  "easier_example",
  "prerequisite_review",
  "mini_assessment",
];

export type RecentActionTrace = {
  action: LearningAction;
  topicKey: string;
};

/**
 * Break pedagogical loops: ≥3 identical action+topic without progress
 * → force next strategy on the escalation ladder.
 */
export function breakActionLoop(input: {
  allowed: LearningAction[];
  recent: RecentActionTrace[];
  topicKey: string;
  progressMade: boolean;
}): { allowed: LearningAction[]; forced: LearningAction | null } {
  if (input.progressMade || input.recent.length < 3) {
    return { allowed: input.allowed, forced: null };
  }
  const last3 = input.recent.slice(-3);
  const same =
    last3.every(
      (r) =>
        r.topicKey === input.topicKey && r.action === last3[0]!.action,
    );
  if (!same) return { allowed: input.allowed, forced: null };

  const stuck = last3[0]!.action;
  const idx = ANTI_LOOP_ESCALATION.indexOf(stuck);
  const nextOnLadder =
    idx >= 0
      ? ANTI_LOOP_ESCALATION[Math.min(idx + 1, ANTI_LOOP_ESCALATION.length - 1)]
      : ANTI_LOOP_ESCALATION[0]!;

  // Prefer something different from the stuck action.
  const candidates = ANTI_LOOP_ESCALATION.filter((a) => a !== stuck);
  const forced =
    candidates.find((a) => input.allowed.includes(a)) ??
    (input.allowed.includes(nextOnLadder) ? nextOnLadder : null) ??
    input.allowed.find((a) => a !== stuck) ??
    null;

  if (!forced) return { allowed: input.allowed, forced: null };

  const allowed = [
    forced,
    ...input.allowed.filter((a) => a !== stuck && a !== forced),
  ];
  return { allowed: [...new Set(allowed)], forced };
}

/**
 * Prefer a different teaching mode after repeated failures (anti-reteach-loop).
 */
export function escalateTeachingMode(
  current: TeachingMode,
  repeatedErrorCount: number,
): TeachingMode {
  if (repeatedErrorCount < 2) return current;
  const ladder: TeachingMode[] = [
    "concise_explanation",
    "step_by_step",
    "worked_example",
    "analogy",
    "socratic",
    "formula_first",
    "visual_first",
    "retrieval_first",
  ];
  const idx = ladder.indexOf(current);
  if (idx < 0) return "worked_example";
  const step = Math.min(repeatedErrorCount - 1, ladder.length - 1 - Math.max(0, idx));
  return ladder[Math.min(idx + Math.max(1, step), ladder.length - 1)]!;
}

/**
 * Filter candidate actions before asking Jev (anti-chaos).
 */
export function filterCandidateActions(input: {
  sessionMinutesRemaining: number;
  topic: TopicMasteryState;
  graph: ExamGraph;
  masteryByKey: Map<string, { mastery: number; status: string }>;
  reviewDue: boolean;
  lastAnswerCorrect: boolean | null;
  repeatedMisconception: boolean;
  recentActions?: RecentActionTrace[];
  progressMade?: boolean;
}): LearningAction[] {
  const actions: LearningAction[] = [
    "teach",
    "worked_example",
    "easier_example",
    "practice",
    "retrieval_practice",
    "prerequisite_review",
    "reteach",
    "mini_assessment",
    "advance",
    "scheduled_review",
  ];

  let out = [...actions];

  if (input.sessionMinutesRemaining < 5) {
    out = out.filter(
      (a) =>
        a === "retrieval_practice" ||
        a === "mini_assessment" ||
        a === "scheduled_review" ||
        a === "easier_example",
    );
  } else if (input.sessionMinutesRemaining < 12) {
    out = out.filter((a) => a !== "teach" || input.topic.evidenceCount === 0);
  }

  if (!prerequisitesMet(input.graph, input.topic.topicKey, input.masteryByKey)) {
    out = out.filter((a) => a !== "advance");
    if (!out.includes("prerequisite_review")) out.push("prerequisite_review");
  } else {
    out = out.filter((a) => a !== "prerequisite_review");
  }

  const advance = canAdvanceTopic({
    topic: input.topic,
    graph: input.graph,
    masteryByKey: input.masteryByKey,
  });
  if (!advance.allowed) {
    out = out.filter((a) => a !== "advance");
  }

  if (input.reviewDue) {
    if (!out.includes("scheduled_review")) out.push("scheduled_review");
  }

  if (input.repeatedMisconception) {
    if (!out.includes("reteach")) out.push("reteach");
    if (!out.includes("easier_example")) out.push("easier_example");
    if (!out.includes("worked_example")) out.push("worked_example");
  }

  if (input.topic.status === "unseen" || input.topic.evidenceCount === 0) {
    out = out.filter((a) => a !== "advance" && a !== "mini_assessment");
    // Short sessions cannot start a full lesson — keep micro moves only.
    if (input.sessionMinutesRemaining >= 5 && !out.includes("teach")) {
      out.push("teach");
    }
  }

  if (input.lastAnswerCorrect === false) {
    out = out.filter((a) => a !== "advance");
  }

  // Fast learner: high mastery → prefer assessment/advance over endless teach.
  if (
    input.topic.mastery >= 0.7 &&
    input.topic.masteryConfidence >= 0.55 &&
    input.topic.evidenceCount >= 3
  ) {
    out = out.filter((a) => a !== "teach" && a !== "reteach");
    if (!out.includes("mini_assessment")) out.push("mini_assessment");
    if (!out.includes("practice")) out.push("practice");
  }

  out = [...new Set(out)];

  const loop = breakActionLoop({
    allowed: out,
    recent: input.recentActions ?? [],
    topicKey: input.topic.topicKey,
    progressMade: input.progressMade ?? false,
  });
  return loop.allowed;
}

export type PolicyApplyResult = {
  action: LearningAction;
  teachingMode: TeachingMode;
  difficulty: DifficultyLevel;
  readyToAdvance: boolean;
  needsPrerequisiteReview: boolean;
  needsGpt4o: boolean;
  needsDailyReplan: boolean;
  overridden: boolean;
  overrideReason: string | null;
};

/**
 * Apply confidence band + advance gates to a Jev (or fallback) decision.
 */
export function applyPolicyToDecision(input: {
  decision: JevDecisionResult;
  allowedActions: LearningAction[];
  topic: TopicMasteryState;
  graph: ExamGraph;
  masteryByKey: Map<string, { mastery: number; status: string }>;
}): PolicyApplyResult {
  const d = input.decision;
  let action = d.action;
  let overridden = false;
  let overrideReason: string | null = null;

  if (!input.allowedActions.includes(action)) {
    action = input.allowedActions[0] ?? "practice";
    overridden = true;
    overrideReason = "action_not_in_allowlist";
  }

  const advance = canAdvanceTopic({
    topic: input.topic,
    graph: input.graph,
    masteryByKey: input.masteryByKey,
  });

  let readyToAdvance = d.readyToAdvance && advance.allowed;
  if (d.readyToAdvance && !advance.allowed) {
    readyToAdvance = false;
    if (action === "advance") {
      action = input.allowedActions.find((a) => a !== "advance") ?? "practice";
      overridden = true;
      overrideReason = advance.reasons[0] ?? "advance_blocked";
    }
  }

  // Low confidence → prefer safer pedagogical moves
  if (d.confidence < JEV_CONFIDENCE_V1.medium) {
    if (action === "advance") {
      action = "mini_assessment";
      if (!input.allowedActions.includes(action)) {
        action = input.allowedActions[0] ?? "practice";
      }
      overridden = true;
      overrideReason = "low_confidence_no_advance";
    }
  }

  const needsPrerequisiteReview =
    d.needsPrerequisiteReview ||
    !prerequisitesMet(input.graph, input.topic.topicKey, input.masteryByKey);

  if (needsPrerequisiteReview && action === "advance") {
    action = "prerequisite_review";
    overridden = true;
    overrideReason = "prerequisite_forced";
  }

  const teachingMode = escalateTeachingMode(
    d.teachingMode,
    input.topic.repeatedErrorCount,
  );
  if (teachingMode !== d.teachingMode) {
    overridden = true;
    overrideReason = overrideReason ?? "teaching_mode_escalated";
  }

  // Force GPT-4o path signal after deep struggle (governor still gates via router).
  const needsGpt4o =
    d.needsGpt4o || input.topic.repeatedErrorCount >= 4;

  return {
    action,
    teachingMode,
    difficulty: d.difficulty,
    readyToAdvance,
    needsPrerequisiteReview,
    needsGpt4o,
    needsDailyReplan: d.needsDailyReplan,
    overridden,
    overrideReason,
  };
}

export function hasRepeatedInterventionFailure(input: {
  recent: RecentActionTrace[];
  topicKey: string;
  progressMade: boolean;
}): boolean {
  if (input.progressMade || input.recent.length < 3) return false;
  const last3 = input.recent.slice(-3);
  const stuck = last3[0]!.action;
  return last3.every(
    (r) => r.topicKey === input.topicKey && r.action === stuck,
  );
}

function fastPathDecision(
  state: CompactDecisionState,
  action: LearningAction,
  reasonCode: string,
  teachingMode: TeachingMode,
): JevDecisionResult {
  return {
    provider: "deterministic",
    action,
    teachingMode,
    difficulty: "medium",
    needsPrerequisiteReview: state.evidence.prerequisite_status === "blocked",
    readyToAdvance: action === "advance",
    needsGpt4o: false,
    needsDailyReplan: false,
    misconceptionSeverity: 0,
    modelRecommendation: "gpt-4o-mini",
    confidence: 0.95,
    probabilities: { next_action: 0.95 },
    latencyMs: 0,
    fallbackReason: null,
    reasonCodes: [reasonCode],
  };
}

/**
 * Skip a model call when policy already makes the local action unambiguous.
 * A hit is an intentional deterministic decision, not a provider failure.
 */
export function tryDeterministicFastPath(
  state: CompactDecisionState,
): JevDecisionResult | null {
  const allowed = state.allowed_actions;
  if (!allowed.length) return null;

  const reviewDue = state.plan.review_due === true;
  const prereqBlocked = state.evidence.prerequisite_status === "blocked";
  const repeated = state.evidence.repeated_misconception;
  const lastWrong = state.evidence.last_answer_correct === false;
  const independent = state.objective.independent_evidence;

  const advanceReady =
    allowed.includes("advance") &&
    !reviewDue &&
    !prereqBlocked &&
    !repeated &&
    !lastWrong &&
    state.objective.mastery >= ADVANCE_V1.masteryMin &&
    state.objective.mastery_confidence >= ADVANCE_V1.confidenceMin &&
    state.objective.attempt_count >= ADVANCE_V1.minEvidence &&
    independent != null &&
    independent >= ADVANCE_V1.minIndependent;

  if (advanceReady) {
    return fastPathDecision(state, "advance", "READY_TO_ADVANCE", "step_by_step");
  }

  if (reviewDue && !prereqBlocked && !repeated && !lastWrong) {
    if (allowed.includes("scheduled_review")) {
      return fastPathDecision(
        state,
        "scheduled_review",
        "REVIEW_DUE",
        "retrieval_first",
      );
    }
    if (allowed.includes("retrieval_practice")) {
      return fastPathDecision(
        state,
        "retrieval_practice",
        "REVIEW_DUE",
        "retrieval_first",
      );
    }
  }

  if (allowed.length === 1) {
    return fastPathDecision(
      state,
      allowed[0]!,
      "SINGLE_CANDIDATE",
      "step_by_step",
    );
  }

  return null;
}

/** Decision-model escalation only. Tutor content routing uses its own signals. */
export function decisionEscalationReason(input: {
  confidence: number;
  repeatedMisconception: boolean;
  misconceptionSeverity: number;
  hints?: DecisionEscalationHints;
}): DecisionEscalationReason | null {
  const hints = input.hints ?? {};
  if (input.confidence < JEV_CONFIDENCE_V1.medium) {
    return "LOW_DECISION_CONFIDENCE";
  }
  if (
    hints.complexMisconception ||
    (input.repeatedMisconception && input.misconceptionSeverity >= 2)
  ) {
    return "COMPLEX_MISCONCEPTION";
  }
  if (hints.conflictingEvidence) return "CONFLICTING_EVIDENCE";
  if (hints.repeatedInterventionFailure) {
    return "REPEATED_INTERVENTION_FAILURE";
  }
  if (hints.complexReasoning) return "COMPLEX_REASONING";
  if (hints.highImpactAssessment) return "HIGH_IMPACT_ASSESSMENT";
  return null;
}

export { ADVANCE_V1, JEV_CONFIDENCE_V1 };
