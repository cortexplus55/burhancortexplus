/**
 * MasteryEngine config — adaptive-v1.
 * Magic numbers live here, not in components.
 */

import type { DifficultyLevel } from "@/lib/adaptive/types";

export const MASTERY_V1 = {
  maxDelta: 0.12,
  difficultyWeights: {
    foundation: 0.5,
    easy: 0.7,
    medium: 1.0,
    hard: 1.25,
    exam_level: 1.5,
  } satisfies Record<DifficultyLevel, number>,
  independenceWeight: 1.2,
  hintPenalty: 0.6,
  transferBonus: 1.15,
  retryPenalty: 0.75,
  /** Confidence grows slower than mastery; one easy hit stays low-confidence. */
  confidenceBase: 0.15,
  confidencePerEvidence: 0.08,
  confidenceDifficultyBonus: 0.05,
  confidenceCapPerUpdate: 0.1,
} as const;

export const ADVANCE_V1 = {
  masteryMin: 0.75,
  confidenceMin: 0.65,
  minEvidence: 4,
  minIndependent: 2,
  minMediumOrHard: 1,
} as const;

export const JEV_CONFIDENCE_V1 = {
  high: 0.85,
  medium: 0.65,
} as const;

export const REVIEW_INTERVALS_DAYS_V1 = [1, 3, 7, 14, 30] as const;

export const PRIORITY_V1 = {
  maxCandidates: 5,
  importanceWeight: 1.2,
  masteryDeficitWeight: 1.4,
  reviewUrgencyWeight: 1.3,
  planUrgencyWeight: 1.0,
  prerequisitePenalty: 0.4,
} as const;
