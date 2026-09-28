/**
 * Normalize / validate Jev-like decision payloads into JevDecisionResult.
 * OpenAI path keeps normalizeDecisionPayload; Jev path uses normalizeJevAnswers.
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
import { NOUL_THRESHOLDS } from "@/lib/adaptive/jev/questions";

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

function asNoul(value: unknown, threshold: number = NOUL_THRESHOLDS.default): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value >= threshold;
  return false;
}

function asScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

function readFlatField(
  answers: Record<string, unknown>,
  root: Record<string, unknown>,
  key: string,
): unknown {
  const entry = answers[key];
  if (entry && typeof entry === "object" && "value" in (entry as object)) {
    return (entry as { value: unknown }).value;
  }
  if (entry && typeof entry === "object" && "choice" in (entry as object)) {
    return (entry as { choice: unknown }).choice;
  }
  return entry ?? root[key];
}

function readConf(
  answers: Record<string, unknown>,
  root: Record<string, unknown>,
  key: string,
): number {
  const entry = answers[key];
  if (entry && typeof entry === "object" && "confidence" in (entry as object)) {
    return asProb((entry as { confidence: unknown }).confidence, 0.7);
  }
  return asProb(root.confidence, 0.7);
}

/**
 * Accepts either a flat object or { answers: { next_action: {...}, ... } }.
 * Used by the OpenAI decision provider (flat JSON) and legacy shapes.
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

  const read = (key: string): unknown =>
    readFlatField(answers, root, key);

  const action = pickAction(
    read("next_action") ?? read("action"),
    input.allowedActions,
  );
  const teachingMode = pickMode(read("teaching_mode") ?? read("teachingMode"));
  const difficulty = pickDifficulty(read("difficulty"));
  const needsPrerequisiteReview = asNoul(
    read("needs_prerequisite_review") ?? read("needsPrerequisiteReview"),
  );
  const readyToAdvance = asNoul(
    read("ready_to_advance") ?? read("readyToAdvance"),
    NOUL_THRESHOLDS.ready_to_advance,
  );
  const needsGpt4o = asNoul(read("needs_gpt4o") ?? read("needsGpt4o"));
  const needsDailyReplan = asNoul(
    read("needs_daily_replan") ?? read("needsDailyReplan"),
  );
  const misconceptionSeverity = asScore(
    read("misconception_severity") ?? read("misconceptionSeverity"),
  );

  const confidences = [
    readConf(answers, root, "next_action"),
    readConf(answers, root, "teaching_mode"),
    readConf(answers, root, "difficulty"),
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
      next_action: readConf(answers, root, "next_action"),
      teaching_mode: readConf(answers, root, "teaching_mode"),
      difficulty: readConf(answers, root, "difficulty"),
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

type AnswerEntry = Record<string, unknown>;

function asAnswerMap(raw: unknown): Record<string, AnswerEntry> | null {
  const root =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!root) return null;
  const answers =
    root.answers && typeof root.answers === "object"
      ? (root.answers as Record<string, unknown>)
      : root;
  const out: Record<string, AnswerEntry> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (v && typeof v === "object") out[k] = v as AnswerEntry;
  }
  return out;
}

export type NormalizeJevOk = {
  ok: true;
  result: JevDecisionResult;
  rawMisconceptionSeverity: number;
};

export type NormalizeJevErr = {
  ok: false;
  error: "invalid_response";
  detail: string;
};

/**
 * Type-aware parser for official TypeSafe answers:
 * noul → {type,noul}, choice → {type,choice,probabilities,confidence},
 * score → {type,score,...}.
 */
export function normalizeJevAnswers(
  raw: unknown,
  input: {
    allowedActions: LearningAction[];
    provider?: JevDecisionResult["provider"];
    latencyMs: number;
    fallbackReason?: string | null;
  },
): NormalizeJevOk | NormalizeJevErr {
  const answers = asAnswerMap(raw);
  if (!answers) {
    return { ok: false, error: "invalid_response", detail: "no_answers" };
  }

  const next = answers.next_action;
  if (!next || next.type !== "choice" || typeof next.choice !== "string") {
    return {
      ok: false,
      error: "invalid_response",
      detail: "next_action_missing",
    };
  }
  if (!input.allowedActions.includes(next.choice as LearningAction)) {
    return {
      ok: false,
      error: "invalid_response",
      detail: "next_action_not_allowed",
    };
  }

  const action = next.choice as LearningAction;
  const confidence = asProb(next.confidence, 0.5);

  const modeAns = answers.teaching_mode;
  const teachingMode = pickMode(
    modeAns && modeAns.type === "choice" ? modeAns.choice : undefined,
  );

  const diffAns = answers.difficulty;
  let difficulty: DifficultyLevel = "medium";
  if (diffAns?.type === "choice") {
    difficulty = pickDifficulty(diffAns.choice);
  } else if (diffAns?.type === "score" && typeof diffAns.score === "number") {
    // Score fallback if a future question set switches difficulty to score.
    const idx = Math.max(0, Math.min(4, Math.round(diffAns.score)));
    difficulty = DIFFICULTY_LEVELS[idx] ?? "medium";
  }

  const sevAns = answers.misconception_severity;
  const rawSeverity =
    sevAns?.type === "score" && typeof sevAns.score === "number"
      ? sevAns.score
      : 0;
  const misconceptionSeverity = asScore(rawSeverity);

  const noul = (key: string, threshold: number): { flag: boolean; p: number } => {
    const a = answers[key];
    if (!a || a.type !== "noul" || typeof a.noul !== "number") {
      return { flag: false, p: 0 };
    }
    return { flag: a.noul >= threshold, p: asProb(a.noul, 0) };
  };

  const prereq = noul("needs_prerequisite_review", NOUL_THRESHOLDS.default);
  const advance = noul("ready_to_advance", NOUL_THRESHOLDS.ready_to_advance);
  const gpt4o = noul("needs_gpt4o", NOUL_THRESHOLDS.default);
  const replan = noul("needs_daily_replan", NOUL_THRESHOLDS.default);

  const probabilities: Record<string, number> = {
    [`next_action.${action}`]: asProb(
      next.probabilities &&
        typeof next.probabilities === "object" &&
        (next.probabilities as Record<string, unknown>)[action],
      confidence,
    ),
    [`teaching_mode.${teachingMode}`]: asProb(
      modeAns?.probabilities &&
        typeof modeAns.probabilities === "object" &&
        (modeAns.probabilities as Record<string, unknown>)[teachingMode],
      asProb(modeAns?.confidence, 0.5),
    ),
    needs_prerequisite_review: prereq.p,
    ready_to_advance: advance.p,
    needs_gpt4o: gpt4o.p,
    needs_daily_replan: replan.p,
    misconception_severity: rawSeverity,
  };

  if (next.probabilities && typeof next.probabilities === "object") {
    for (const [k, v] of Object.entries(
      next.probabilities as Record<string, unknown>,
    )) {
      probabilities[`next_action.${k}`] = asProb(v, 0);
    }
  }
  if (modeAns?.probabilities && typeof modeAns.probabilities === "object") {
    for (const [k, v] of Object.entries(
      modeAns.probabilities as Record<string, unknown>,
    )) {
      probabilities[`teaching_mode.${k}`] = asProb(v, 0);
    }
  }
  if (diffAns?.type === "choice" && diffAns.probabilities) {
    for (const [k, v] of Object.entries(
      diffAns.probabilities as Record<string, unknown>,
    )) {
      probabilities[`difficulty.${k}`] = asProb(v, 0);
    }
  }

  const modelRecommendation: TutorModel = gpt4o.flag ? "gpt-4o" : "gpt-4o-mini";

  return {
    ok: true,
    rawMisconceptionSeverity: rawSeverity,
    result: {
      provider: input.provider ?? "jev",
      action,
      teachingMode,
      difficulty,
      needsPrerequisiteReview: prereq.flag,
      readyToAdvance: advance.flag,
      needsGpt4o: gpt4o.flag,
      needsDailyReplan: replan.flag,
      misconceptionSeverity,
      modelRecommendation,
      confidence,
      probabilities,
      latencyMs: input.latencyMs,
      fallbackReason: input.fallbackReason ?? null,
    },
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
