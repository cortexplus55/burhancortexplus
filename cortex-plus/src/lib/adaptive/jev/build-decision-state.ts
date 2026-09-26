/**
 * Compact decision state for Jev — never send PDFs or full DB rows.
 */

import type {
  CompactDecisionState,
  LearningAction,
  TopicMasteryState,
} from "@/lib/adaptive/types";

export function buildDecisionState(input: {
  examDaysRemaining: number;
  sessionMinutesRemaining: number;
  fatigueSignal?: number;
  topic: TopicMasteryState;
  lastAnswerCorrect: boolean | null;
  hintCount: number;
  repeatedMisconception: boolean;
  todayTarget: string;
  behindSchedule: boolean;
  allowedActions: LearningAction[];
  candidateTopics: { topic_id: string; priority: number }[];
  reviewDue?: boolean;
  prerequisiteStatus?: "met" | "blocked";
  independentEvidence?: number;
}): CompactDecisionState {
  return {
    student: {
      exam_days_remaining: Math.max(0, Math.round(input.examDaysRemaining)),
      session_minutes_remaining: Math.max(
        0,
        Math.round(input.sessionMinutesRemaining),
      ),
      fatigue_signal: Math.max(
        0,
        Math.min(1, input.fatigueSignal ?? 0.2),
      ),
    },
    objective: {
      topic_id: input.topic.topicId || input.topic.topicKey,
      mastery: Number(input.topic.mastery.toFixed(3)),
      mastery_confidence: Number(input.topic.masteryConfidence.toFixed(3)),
      recent_accuracy: input.topic.recentAccuracy,
      attempt_count: input.topic.evidenceCount,
      independent_evidence: input.independentEvidence,
    },
    evidence: {
      last_answer_correct: input.lastAnswerCorrect,
      hint_count: input.hintCount,
      repeated_misconception: input.repeatedMisconception,
      prerequisite_status: input.prerequisiteStatus ?? "met",
    },
    plan: {
      today_target: input.todayTarget.slice(0, 120),
      behind_schedule: input.behindSchedule,
      review_due: input.reviewDue === true,
    },
    allowed_actions: input.allowedActions,
    candidate_topics: input.candidateTopics.slice(0, 5),
  };
}

export function hashDecisionState(state: CompactDecisionState): string {
  const json = JSON.stringify(state);
  let h = 0;
  for (let i = 0; i < json.length; i += 1) {
    h = (Math.imul(31, h) + json.charCodeAt(i)) | 0;
  }
  return `s${(h >>> 0).toString(16)}`;
}
