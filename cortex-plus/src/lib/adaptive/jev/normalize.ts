/**
 * Normalize / validate Jev-like decision payloads into JevDecisionResult.
 */

import {
  DIFFICULTY_LEVELS,
  LEARNING_ACTIONS,
  TEACHING_MODES,
  type DifficultyLevel,
  type JevDecisionResult,
  type LearningAction,
  type TeachingMode,
  type TutorModel,
} from "@/lib/adaptive/types";

function pickAction(
  value: unknown,
  allowed: LearningAction[],
): LearningAction {
  const v = String(value ?? "");
  if (allowed.includes(v as LearningAction)) return v as LearningAction;
  if (LEARNING_ACTIONS.includes(v as LearningAction)) {
    return allowed.includes(v as LearningAction)
      ? (v as LearningAction)
      : (allowed[0] ?? "practice");
  }
  return allowed[0] ?? "practice";
}

function pickMode(value: unknown): TeachingMode {
  const v = String(value ?? "");
  return TEACHING_MODES.includes(v as TeachingMode)
    ? (v as TeachingMode)
    : "step_by_step";
}

function pickDifficulty(value: unknown): DifficultyLevel {
  const v = String(value ?? "");
  return DIFFICULTY_LEVELS.includes(v as DifficultyLevel)
    ? (v as DifficultyLevel)
    : "medium";
}

function asProb(value: unknown, fallback = 0.5): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function asNoul(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value >= 0.5;
  return false;
}

function asScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

/**
 * Accepts either a flat object or { answers: { next_action: {...}, ... } }.
 */
export function normalizeDecisionPayload(
  raw: unknown,
  input: {
    allowedActions: LearningAction[];
    provider: JevDecisionResult["provider"];
    latencyMs: number;
    fallbackReason?: string | null;
  },
): JevDecisionResult {
  const root =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers =
    root.answers && typeof root.answers === "object"
      ? (root.answers as Record<string, unknown>)
      : root;

  const read = (key: string): unknown => {
    const entry = answers[key];
    if (entry && typeof entry === "object" && "value" in (entry as object)) {
      return (entry as { value: unknown }).value;
    }
    if (entry && typeof entry === "object" && "choice" in (entry as object)) {
      return (entry as { choice: unknown }).choice;
    }
    return entry ?? root[key];
  };

  const readConf = (key: string): number => {
    const entry = answers[key];
    if (entry && typeof entry === "object" && "confidence" in (entry as object)) {
      return asProb((entry as { confidence: unknown }).confidence, 0.7);
    }
    return asProb(root.confidence, 0.7);
  };

  const action = pickAction(read("next_action") ?? read("action"), input.allowedActions);
  const teachingMode = pickMode(read("teaching_mode") ?? read("teachingMode"));
  const difficulty = pickDifficulty(read("difficulty"));
  const needsPrerequisiteReview = asNoul(
    read("needs_prerequisite_review") ?? read("needsPrerequisiteReview"),
  );
  const readyToAdvance = asNoul(
    read("ready_to_advance") ?? read("readyToAdvance"),
  );
  const needsGpt4o = asNoul(read("needs_gpt4o") ?? read("needsGpt4o"));
  const needsDailyReplan = asNoul(
    read("needs_daily_replan") ?? read("needsDailyReplan"),
  );
  const misconceptionSeverity = asScore(
    read("misconception_severity") ?? read("misconceptionSeverity"),
  );

  const confidences = [
    readConf("next_action"),
    readConf("teaching_mode"),
    readConf("difficulty"),
  ];
  const confidence =
    confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const modelRecommendation: TutorModel = needsGpt4o ? "gpt-4o" : "gpt-4o-mini";
  const reasonCodes = asReasonCodes(
    read("reasonCodes") ?? read("reason_codes"),
  );

  return {
    provider: input.provider,
    action,
    teachingMode,
    difficulty,
    needsPrerequisiteReview,
    readyToAdvance,
    needsGpt4o,
    needsDailyReplan,
    misconceptionSeverity,
    modelRecommendation,
    confidence,
    probabilities: {
      next_action: readConf("next_action"),
      teaching_mode: readConf("teaching_mode"),
      difficulty: readConf("difficulty"),
      needs_prerequisite_review: asProb(
        Number(needsPrerequisiteReview),
        needsPrerequisiteReview ? 0.8 : 0.2,
      ),
      ready_to_advance: asProb(
        Number(readyToAdvance),
        readyToAdvance ? 0.8 : 0.2,
      ),
      needs_gpt4o: asProb(Number(needsGpt4o), needsGpt4o ? 0.8 : 0.2),
      needs_daily_replan: asProb(
        Number(needsDailyReplan),
        needsDailyReplan ? 0.8 : 0.2,
      ),
    },
    latencyMs: input.latencyMs,
    fallbackReason: input.fallbackReason ?? null,
    ...(reasonCodes ? { reasonCodes } : {}),
  };
}

function asReasonCodes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const codes = value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, 8);
  return codes.length ? codes : undefined;
}

/** Deterministic safe default when both Jev and OpenAI fail. */
export function deterministicFallback(
  allowedActions: LearningAction[],
  latencyMs = 0,
  reason = "all_providers_failed",
): JevDecisionResult {
  const action =
    allowedActions.find((a) => a === "practice") ??
    allowedActions.find((a) => a === "teach") ??
    allowedActions[0] ??
    "practice";
  return {
    provider: "deterministic",
    action,
    teachingMode: "step_by_step",
    difficulty: "medium",
    needsPrerequisiteReview: false,
    readyToAdvance: false,
    needsGpt4o: false,
    needsDailyReplan: false,
    misconceptionSeverity: 0,
    modelRecommendation: "gpt-4o-mini",
    confidence: 0.5,
    probabilities: {},
    latencyMs,
    fallbackReason: reason,
  };
}
