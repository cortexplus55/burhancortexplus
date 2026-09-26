/**
 * MasteryEngine — evidence-based mastery updates (adaptive-v1).
 * Pure; no DB. Magic numbers from config/mastery-v1.
 */

import { MASTERY_V1 } from "@/lib/adaptive/config/mastery-v1";
import type {
  DifficultyLevel,
  LearningEvidence,
  TopicMasteryState,
  TopicStatus,
} from "@/lib/adaptive/types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function evidenceStrength(evidence: LearningEvidence): number {
  const diffW =
    MASTERY_V1.difficultyWeights[evidence.difficulty] ??
    MASTERY_V1.difficultyWeights.medium;
  let independence = evidence.independent
    ? MASTERY_V1.independenceWeight
    : 1;
  if (evidence.hintUsed) independence *= MASTERY_V1.hintPenalty;
  if (evidence.retry) independence *= MASTERY_V1.retryPenalty;
  const transfer = evidence.transfer ? MASTERY_V1.transferBonus : 1;
  const sign = evidence.correct ? 1 : -1;
  const examBoost = evidence.examLevel && evidence.correct ? 1.1 : 1;
  const retrievalBoost =
    evidence.retrievalAfterDelay && evidence.correct ? 1.1 : 1;
  return (
    sign * diffW * independence * transfer * examBoost * retrievalBoost
  );
}

export function discreteLevelFromMastery(
  mastery: number,
  evidenceCount: number,
): "unmeasured" | "weak" | "emerging" | "solid" {
  if (evidenceCount <= 0) return "unmeasured";
  if (mastery < 0.4) return "weak";
  if (mastery < 0.7) return "emerging";
  return "solid";
}

export function statusFromMastery(input: {
  mastery: number;
  confidence: number;
  reviewDueAt: string | null;
  repeatedErrorCount: number;
  evidenceCount: number;
  now?: Date;
}): TopicStatus {
  const now = input.now ?? new Date();
  if (input.evidenceCount <= 0) return "unseen";
  if (
    input.reviewDueAt &&
    new Date(input.reviewDueAt).getTime() <= now.getTime()
  ) {
    return "review_due";
  }
  if (input.repeatedErrorCount >= 3 && input.mastery < 0.55) return "at_risk";
  if (input.mastery >= 0.8 && input.confidence >= 0.65) return "mastered";
  if (input.mastery >= 0.55) return "developing";
  if (input.mastery >= 0.25) return "learning";
  return "introduced";
}

export type MasteryUpdateResult = {
  next: TopicMasteryState;
  delta: number;
  strength: number;
  discreteLevel: "unmeasured" | "weak" | "emerging" | "solid";
};

/**
 * Bounded smooth update: one answer cannot swing mastery more than maxDelta.
 */
export function applyMasteryEvidence(
  current: TopicMasteryState,
  evidence: LearningEvidence,
): MasteryUpdateResult {
  const strength = evidenceStrength(evidence);
  const rawDelta = strength * 0.08;
  const delta = Math.max(
    -MASTERY_V1.maxDelta,
    Math.min(MASTERY_V1.maxDelta, rawDelta),
  );
  const mastery = clamp01(current.mastery + delta);

  const difficultyBonus =
    (MASTERY_V1.difficultyWeights[evidence.difficulty] - 0.7) *
    MASTERY_V1.confidenceDifficultyBonus;
  const confGain = Math.min(
    MASTERY_V1.confidenceCapPerUpdate,
    MASTERY_V1.confidencePerEvidence + Math.max(0, difficultyBonus),
  );
  // Wrong answers still add a little confidence (we learned something about gaps)
  // but correct independent answers add more.
  const confDelta = evidence.correct
    ? confGain * (evidence.independent && !evidence.hintUsed ? 1 : 0.7)
    : confGain * 0.35;
  const masteryConfidence = clamp01(
    current.evidenceCount === 0
      ? MASTERY_V1.confidenceBase + confDelta
      : current.masteryConfidence + confDelta,
  );

  const evidenceCount = current.evidenceCount + 1;
  const streakCorrect = evidence.correct ? current.streakCorrect + 1 : 0;
  const repeatedErrorCount = evidence.correct
    ? Math.max(0, current.repeatedErrorCount - 1)
    : current.repeatedErrorCount + (evidence.misconceptionTag ? 1 : 0);

  const misconceptionFlags = [...current.misconceptionFlags];
  if (evidence.misconceptionTag && !evidence.correct) {
    if (!misconceptionFlags.includes(evidence.misconceptionTag)) {
      misconceptionFlags.push(evidence.misconceptionTag);
    }
  } else if (evidence.correct && evidence.misconceptionTag) {
    const idx = misconceptionFlags.indexOf(evidence.misconceptionTag);
    if (idx >= 0) misconceptionFlags.splice(idx, 1);
  }

  let currentDifficulty: DifficultyLevel = current.currentDifficulty;
  if (evidence.correct && streakCorrect >= 2) {
    currentDifficulty = bumpDifficulty(currentDifficulty, 1);
  } else if (!evidence.correct && repeatedErrorCount >= 2) {
    currentDifficulty = bumpDifficulty(currentDifficulty, -1);
  }

  const next: TopicMasteryState = {
    ...current,
    mastery,
    masteryConfidence,
    evidenceCount,
    streakCorrect,
    repeatedErrorCount,
    misconceptionFlags,
    currentDifficulty,
    lastStudiedAt: new Date().toISOString(),
    lastAssessedAt: new Date().toISOString(),
    recentAccuracy: blendAccuracy(current.recentAccuracy, evidence.correct),
    independentAccuracy:
      evidence.independent && !evidence.hintUsed
        ? blendAccuracy(current.independentAccuracy, evidence.correct)
        : current.independentAccuracy,
    examLevelAccuracy: evidence.examLevel
      ? blendAccuracy(current.examLevelAccuracy, evidence.correct)
      : current.examLevelAccuracy,
    status: "learning",
  };
  next.status = statusFromMastery({
    mastery: next.mastery,
    confidence: next.masteryConfidence,
    reviewDueAt: next.reviewDueAt,
    repeatedErrorCount: next.repeatedErrorCount,
    evidenceCount: next.evidenceCount,
  });

  return {
    next,
    delta,
    strength,
    discreteLevel: discreteLevelFromMastery(mastery, evidenceCount),
  };
}

function blendAccuracy(
  prev: number | null,
  correct: boolean,
  weight = 0.35,
): number {
  const sample = correct ? 1 : 0;
  if (prev == null) return sample;
  return clamp01(prev * (1 - weight) + sample * weight);
}

const DIFF_ORDER: DifficultyLevel[] = [
  "foundation",
  "easy",
  "medium",
  "hard",
  "exam_level",
];

export function bumpDifficulty(
  current: DifficultyLevel,
  steps: number,
): DifficultyLevel {
  const i = DIFF_ORDER.indexOf(current);
  const next = Math.max(0, Math.min(DIFF_ORDER.length - 1, i + steps));
  return DIFF_ORDER[next] ?? "medium";
}

export function emptyTopicMastery(
  topicId: string,
  topicKey: string,
): TopicMasteryState {
  return {
    topicId,
    topicKey,
    mastery: 0,
    masteryConfidence: 0,
    evidenceCount: 0,
    recentAccuracy: null,
    independentAccuracy: null,
    examLevelAccuracy: null,
    currentDifficulty: "medium",
    lastStudiedAt: null,
    lastAssessedAt: null,
    reviewDueAt: null,
    streakCorrect: 0,
    repeatedErrorCount: 0,
    misconceptionFlags: [],
    prerequisiteRisk: false,
    status: "unseen",
  };
}

/** Seed continuous mastery from discrete diagnostic measured level. */
export function seedFromMeasuredLevel(
  topicId: string,
  topicKey: string,
  level: "unknown" | "weak" | "emerging" | "solid" | "unmeasured" | null,
): TopicMasteryState {
  const base = emptyTopicMastery(topicId, topicKey);
  if (!level || level === "unknown" || level === "unmeasured") return base;
  if (level === "weak") {
    return {
      ...base,
      mastery: 0.25,
      masteryConfidence: 0.35,
      evidenceCount: 2,
      status: "introduced",
    };
  }
  if (level === "emerging") {
    return {
      ...base,
      mastery: 0.5,
      masteryConfidence: 0.45,
      evidenceCount: 2,
      status: "learning",
    };
  }
  return {
    ...base,
    mastery: 0.72,
    masteryConfidence: 0.5,
    evidenceCount: 2,
    status: "developing",
  };
}
