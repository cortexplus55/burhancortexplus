/**
 * Adaptive Learning Engine — domain types (policy adaptive-v1).
 * Magic strings live here; UI and APIs import from this module.
 */

export const ADAPTIVE_POLICY_VERSION = "adaptive-v1" as const;

export type LearningAction =
  | "teach"
  | "worked_example"
  | "easier_example"
  | "practice"
  | "retrieval_practice"
  | "prerequisite_review"
  | "reteach"
  | "mini_assessment"
  | "advance"
  | "scheduled_review";

export const LEARNING_ACTIONS: readonly LearningAction[] = [
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
] as const;

export type TeachingMode =
  | "concise_explanation"
  | "step_by_step"
  | "worked_example"
  | "socratic"
  | "analogy"
  | "visual_first"
  | "formula_first"
  | "retrieval_first";

export const TEACHING_MODES: readonly TeachingMode[] = [
  "concise_explanation",
  "step_by_step",
  "worked_example",
  "socratic",
  "analogy",
  "visual_first",
  "formula_first",
  "retrieval_first",
] as const;

export type DifficultyLevel =
  | "foundation"
  | "easy"
  | "medium"
  | "hard"
  | "exam_level";

export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  "foundation",
  "easy",
  "medium",
  "hard",
  "exam_level",
] as const;

export type TopicStatus =
  | "unseen"
  | "introduced"
  | "learning"
  | "developing"
  | "mastered"
  | "review_due"
  | "at_risk";

export type ReasonCode =
  | "REPEATED_MISCONCEPTION"
  | "LOW_MASTERY"
  | "REVIEW_DUE"
  | "PREREQUISITE_GAP"
  | "PLAN_BEHIND"
  | "EXAM_HIGH_WEIGHT_TOPIC"
  | "DIAGNOSTIC_WEAK"
  | "SESSION_TIME_SHORT"
  | "PLAN_OBJECTIVE"
  | "MANUAL_OVERRIDE"
  | "FALLBACK_DEFAULT";

export type KnowledgeGapKind =
  | "isolated_mistake"
  | "procedural_gap"
  | "conceptual_gap"
  | "prerequisite_gap"
  | "careless_error";

export type ReadinessForecast =
  | "on_track"
  | "slight_risk"
  | "behind"
  | "critical";

export type TutorModel = "gpt-4o-mini" | "gpt-4o";

export type DecisionProviderName =
  | "jev"
  | "openai_decision"
  | "openai_fallback"
  | "deterministic";

export type PrerequisiteStatus = "met" | "blocked";

export type DecisionEscalationReason =
  | "LOW_DECISION_CONFIDENCE"
  | "COMPLEX_MISCONCEPTION"
  | "CONFLICTING_EVIDENCE"
  | "REPEATED_INTERVENTION_FAILURE"
  | "COMPLEX_REASONING"
  | "HIGH_IMPACT_ASSESSMENT";

export type DecisionEscalationHints = {
  complexMisconception?: boolean;
  conflictingEvidence?: boolean;
  repeatedInterventionFailure?: boolean;
  complexReasoning?: boolean;
  highImpactAssessment?: boolean;
};

export type DecisionTelemetry = {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  escalated: boolean;
  escalationReason: string | null;
  miniInputTokens?: number;
  miniOutputTokens?: number;
};

export type LearningEventType =
  | "session_started"
  | "lesson_started"
  | "explanation_viewed"
  | "question_presented"
  | "answer_submitted"
  | "hint_requested"
  | "answer_evaluated"
  | "misconception_detected"
  | "mastery_updated"
  | "jev_decision"
  | "intervention_started"
  | "topic_advanced"
  | "review_scheduled"
  | "session_completed"
  | "session_abandoned"
  | "manual_override";

export type SourceRef = {
  documentId?: string;
  chunkId?: string;
  page?: number;
  label?: string;
};

export type TopicMasteryState = {
  topicId: string;
  topicKey: string;
  mastery: number;
  masteryConfidence: number;
  evidenceCount: number;
  recentAccuracy: number | null;
  independentAccuracy: number | null;
  examLevelAccuracy: number | null;
  currentDifficulty: DifficultyLevel;
  lastStudiedAt: string | null;
  lastAssessedAt: string | null;
  reviewDueAt: string | null;
  streakCorrect: number;
  repeatedErrorCount: number;
  misconceptionFlags: string[];
  prerequisiteRisk: boolean;
  status: TopicStatus;
};

export type LearningBehavior = {
  workedExampleSuccess: number;
  retrievalSuccess: number;
  averageHintDependency: number;
  preferredEffectiveFormat: TeachingMode | null;
  sessionCompletionRate: number;
};

export type StudentGlobalState = {
  examPrepId: string;
  examDate: string | null;
  targetScore: number | null;
  dailyMinutes: number | null;
  studyDays: number[];
  planStartDate: string | null;
  planVersion: number;
  daysRemaining: number | null;
  progressPct: number | null;
  readinessPct: number | null;
  forecast: ReadinessForecast;
  policyVersion: typeof ADAPTIVE_POLICY_VERSION;
};

export type LearningEvidence = {
  topicId: string;
  topicKey: string;
  correct: boolean;
  difficulty: DifficultyLevel;
  independent: boolean;
  hintUsed: boolean;
  retry: boolean;
  transfer: boolean;
  examLevel: boolean;
  retrievalAfterDelay: boolean;
  misconceptionTag?: string | null;
  gapKind?: KnowledgeGapKind | null;
  idempotencyKey: string;
};

export type CompactDecisionState = {
  student: {
    exam_days_remaining: number;
    session_minutes_remaining: number;
    fatigue_signal: number;
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
    prerequisite_status?: PrerequisiteStatus;
  };
  plan: {
    today_target: string;
    behind_schedule: boolean;
    review_due?: boolean;
  };
  allowed_actions: LearningAction[];
  candidate_topics?: { topic_id: string; priority: number }[];
};

export type JevDecisionResult = {
  provider: DecisionProviderName;
  action: LearningAction;
  teachingMode: TeachingMode;
  difficulty: DifficultyLevel;
  needsPrerequisiteReview: boolean;
  readyToAdvance: boolean;
  needsGpt4o: boolean;
  needsDailyReplan: boolean;
  misconceptionSeverity: number;
  modelRecommendation: TutorModel;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  fallbackReason?: string | null;
  /** Present only on the server decision object. Never copy onto student payloads. */
  reasonCodes?: string[];
  auditId?: string;
  telemetry?: DecisionTelemetry;
};

export type GovernorAction = {
  action: LearningAction;
  topicId: string;
  topicKey: string;
  subtopicId?: string | null;
  teachingMode: TeachingMode;
  difficulty: DifficultyLevel;
  model: TutorModel;
  durationTarget: number;
  sourceRefs: SourceRef[];
  reasonCode: ReasonCode;
  reasonCopy: string;
  decisionTraceId: string;
  href?: string | null;
};

export type MasterPlanSnapshot = {
  version: number;
  reason: string;
  schedule: unknown;
  createdAt: string;
};

export type DailyPlanItem = {
  id: string;
  kind: string;
  title: string;
  minutes: number;
  topicId?: string | null;
  topicKey?: string | null;
  status: "pending" | "active" | "done" | "skipped";
  reasonCode?: ReasonCode | null;
  href?: string | null;
};

export type DailyPlan = {
  id: string;
  examPrepId: string;
  planDate: string;
  objective: string;
  estimatedMinutes: number;
  items: DailyPlanItem[];
};

export type SessionState = {
  id: string;
  examPrepId: string;
  startedAt: string;
  plannedDurationMinutes: number;
  objective: string;
  currentTopicId: string | null;
  currentStep: number;
  completionPct: number;
  status: "active" | "completed" | "abandoned";
};

export type DecisionBundle = {
  state: CompactDecisionState;
  result: JevDecisionResult;
  policyVersion: typeof ADAPTIVE_POLICY_VERSION;
};

/** Structured learning unit rendered inside the adaptive session. */
export type ActionContentKind =
  | "explanation"
  | "worked_example"
  | "question"
  | "advance_notice";

export type ActionQuestionFormat = "mcq" | "numeric" | "short_text";

export type ActionQuestion = {
  id: string;
  prompt: string;
  format: ActionQuestionFormat;
  choices?: string[];
  /** Server-side grading key; never shown to student in UI payloads when possible. */
  correctAnswer: string;
  /** Acceptable alternate answers for deterministic grading. */
  accept?: string[];
  explanation?: string;
  transfer?: boolean;
};

export type ActionContent = {
  id: string;
  action: LearningAction;
  kind: ActionContentKind;
  topicId: string;
  topicKey: string;
  title: string;
  bodyMarkdown: string;
  steps?: string[];
  misconceptionAddressed?: string | null;
  question?: ActionQuestion | null;
  sourceRefs: SourceRef[];
  model: TutorModel;
  escalationReasons: string[];
  decisionTraceId: string;
};

export type AnswerEvaluationKind =
  | "correct"
  | "lucky"
  | "calculation_slip"
  | "conceptual_misconception"
  | "prerequisite_gap"
  | "partial_understanding"
  | "incorrect";

export type AnswerEvaluation = {
  correct: boolean;
  kind: AnswerEvaluationKind;
  misconceptionTag: string | null;
  feedback: string;
  confidence: number;
};

export type SessionCompletionSummary = {
  objectivesCompleted: string[];
  masteryGained: { topicKey: string; delta: number }[];
  remainingWeakPoint: string | null;
  scheduledReviews: { topicKey: string; dueAt: string }[];
  nextStudyDay: string | null;
  todayProgressPct: number;
  message: string;
};
