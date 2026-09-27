/**
 * Official TypeSafe SystemOne question set for adaptive decisions.
 * Topic-independent English instructions/criteria. Bump VERSION when text changes.
 */

import type { LearningAction, TeachingMode, DifficultyLevel } from "@/lib/adaptive/types";
import { DIFFICULTY_LEVELS, TEACHING_MODES } from "@/lib/adaptive/types";

/** Bump when instructions/criteria change — written into audit usage for calibration. */
export const JEV_QUESTION_SET_VERSION = 1;

export const JEV_STATE_CONTEXT =
  "Adaptive exam-prep tutor. Choose the next local learning step for ONE topic for ONE student. Numeric fields are 0-1 unless named otherwise.";

/** Noul thresholds — single source. ready_to_advance is conservative. */
export const NOUL_THRESHOLDS = {
  default: 0.5,
  ready_to_advance: 0.7,
} as const;

export type JevQuestionDef =
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string | null>;
    }
  | {
      type: "noul";
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | {
      type: "score";
      instructions: string;
      criteria: string[];
    };

export type JevQuestionsMap = Record<string, JevQuestionDef>;

const ACTION_CRITERIA: Record<LearningAction, string> = {
  teach:
    "Introduce or explain the concept because the student needs instruction before practicing.",
  worked_example:
    "Show a fully worked example so the student can see the solution path.",
  easier_example:
    "Present a simpler example to rebuild confidence after struggle.",
  practice: "Give the student a practice item at the current difficulty.",
  retrieval_practice:
    "Prompt active recall without new teaching; strengthen memory of what was learned.",
  prerequisite_review:
    "Review an earlier required skill before continuing with the current topic.",
  reteach:
    "Explain the same concept again from a different angle because the student has not understood it yet.",
  mini_assessment:
    "Run a short check to measure readiness before advancing.",
  advance: "Move the student to the next topic; mastery gates appear satisfied.",
  scheduled_review:
    "Run a spaced-review item that is due, not new teaching.",
};

const MODE_CRITERIA: Record<TeachingMode, string> = {
  concise_explanation: "Short, direct explanation with minimal filler.",
  step_by_step: "Break the concept into ordered steps the student can follow.",
  worked_example: "Lead with a fully solved example, then highlight the pattern.",
  socratic: "Guide with questions so the student constructs the answer.",
  analogy: "Use a familiar analogy to make the abstract idea concrete.",
  visual_first: "Prioritize a diagram, sketch, or spatial framing first.",
  formula_first: "Start from the governing formula or definition, then apply it.",
  retrieval_first: "Start by asking the student to recall before explaining.",
};

/**
 * Difficulty as choice (not score): maps 1:1 onto DifficultyLevel enums without
 * Math.round boundary ambiguity between adjacent levels.
 */
const DIFFICULTY_CRITERIA: Record<DifficultyLevel, string> = {
  foundation: "Rebuild basics; student lacks core prerequisites or confidence.",
  easy: "Gentle items slightly below target exam difficulty.",
  medium: "On-level practice matching the current learning goal.",
  hard: "Challenging items that stretch the student without exam pressure.",
  exam_level: "Items matching real exam difficulty and timing pressure.",
};

const MISCONCEPTION_SCORE_CRITERIA = [
  "None — no misconception signal; errors look like slips or noise.",
  "Minor slip — small procedural or careless mistake, not a wrong model.",
  "Clear misconception — a wrong conceptual model is visible in the evidence.",
  "Deep or repeated conceptual misconception — same wrong model persists across attempts.",
];

export function buildActionCriteria(
  allowed: LearningAction[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const action of allowed) {
    out[action] = ACTION_CRITERIA[action] ?? action;
  }
  return out;
}

/**
 * Build the official questions map. Caller must ensure allowed.length >= 2
 * before calling Jev (single option is already decided).
 */
export function defaultJevQuestions(allowedActions: LearningAction[]): JevQuestionsMap {
  return {
    next_action: {
      type: "choice",
      instructions:
        "Choose the single best next learning action for this student on this topic, using only the structured signals in state. Prefer the least invasive action that addresses the evidence.",
      criteria: buildActionCriteria(allowedActions),
    },
    teaching_mode: {
      type: "choice",
      instructions:
        "Choose the teaching mode that best fits the student's current evidence and the selected next action.",
      criteria: Object.fromEntries(
        TEACHING_MODES.map((m) => [m, MODE_CRITERIA[m]]),
      ) as Record<string, string | null>,
    },
    difficulty: {
      type: "choice",
      instructions:
        "Choose the difficulty level for the next learning content given mastery, recent accuracy, and exam proximity.",
      criteria: Object.fromEntries(
        DIFFICULTY_LEVELS.map((d) => [d, DIFFICULTY_CRITERIA[d]]),
      ) as Record<string, string | null>,
    },
    misconception_severity: {
      type: "score",
      instructions:
        "Rate how severe the student's misconception appears from the evidence. Use higher levels only when a wrong conceptual model is clear or repeated.",
      criteria: [...MISCONCEPTION_SCORE_CRITERIA],
    },
    needs_prerequisite_review: {
      type: "noul",
      instructions:
        "Should the student review a prerequisite skill before continuing with the current topic?",
      criteria: {
        true: "Prerequisite gap is blocking progress on the current topic.",
        false: "Prerequisites are sufficient; stay on the current topic.",
      },
    },
    ready_to_advance: {
      type: "noul",
      instructions:
        "Is the student ready to advance to the next topic? Be conservative — only say yes when mastery and independent evidence look solid.",
      criteria: {
        true: "Mastery, confidence, and recent evidence support advancing.",
        false: "Not ready — more practice, reteach, or assessment is needed.",
      },
    },
    needs_gpt4o: {
      type: "noul",
      instructions:
        "The next learning content needs a stronger, more expensive model because the explanation must handle complex reasoning or a persistent misconception.",
      criteria: {
        true: "Complex reasoning or deep misconception warrants a stronger model.",
        false: "A standard model is sufficient for the next content.",
      },
    },
    needs_daily_replan: {
      type: "noul",
      instructions:
        "Should today's plan be adjusted because the student is significantly behind, stuck, or the current sequence no longer fits?",
      criteria: {
        true: "Plan no longer fits; a limited daily replan is warranted.",
        false: "Stay on the current daily plan.",
      },
    },
  };
}

/** Wrap CompactDecisionState with a fixed English context field for Jev. */
export function buildJevState(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const plan = state.plan;
  let todayTarget = "";
  if (plan && typeof plan === "object" && "today_target" in plan) {
    todayTarget = String((plan as { today_target?: unknown }).today_target ?? "");
  }
  return {
    context: JEV_STATE_CONTEXT,
    ...state,
    plan:
      plan && typeof plan === "object"
        ? {
            ...(plan as object),
            today_target: todayTarget.slice(0, 120),
          }
        : plan,
  };
}
