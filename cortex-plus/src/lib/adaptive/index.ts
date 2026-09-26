/**
 * Pure adaptive helpers safe for unit tests (no server-only).
 */

export {
  applyMasteryEvidence,
  evidenceStrength,
  seedFromMeasuredLevel,
  emptyTopicMastery,
  discreteLevelFromMastery,
  bumpDifficulty,
  statusFromMastery,
} from "@/lib/adaptive/mastery-engine";

export {
  canAdvanceTopic,
  filterCandidateActions,
  applyPolicyToDecision,
  tryDeterministicFastPath,
  decisionEscalationReason,
  hasRepeatedInterventionFailure,
} from "@/lib/adaptive/policy-engine";
export { prioritizeTopics } from "@/lib/adaptive/priority";
export { nextReviewIntervalDays, initialReviewDue } from "@/lib/adaptive/review-scheduler";
export { classifyKnowledgeGap } from "@/lib/adaptive/knowledge-gap";
export { routeTutorModel } from "@/lib/adaptive/tutor-model-router";
export {
  normalizeDecisionPayload,
  deterministicFallback,
} from "@/lib/adaptive/jev/normalize";
export { buildDecisionState, hashDecisionState } from "@/lib/adaptive/jev/build-decision-state";
export { shouldAttemptJev, decisionEngineStatus } from "@/lib/adaptive/jev/provider-mode";
export {
  sanitizedEvalSnapshot,
  scoreDecisionAgreement,
} from "@/lib/adaptive/jev/eval-case";
export {
  estimateTokenCostUsd,
  sessionAiCostReport,
} from "@/lib/adaptive/analytics";
export { shouldReplanMaster, shouldReplanDaily } from "@/lib/adaptive/replan-policy";
export { reasonCopy } from "@/lib/adaptive/reason-copy";
export {
  examPhaseFromDays,
  filterActionsForExamPhase,
} from "@/lib/adaptive/exam-phase";
export {
  stabilizeReadiness,
  computeAdaptiveReadiness,
} from "@/lib/adaptive/readiness";
export {
  breakActionLoop,
  escalateTeachingMode,
} from "@/lib/adaptive/policy-engine";
