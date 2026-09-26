/**
 * Student State — load/persist continuous mastery + global prep context.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  seedFromMeasuredLevel,
} from "@/lib/adaptive/mastery-engine";
import { loadExamGraph, type ExamGraph } from "@/lib/adaptive/exam-graph";
import {
  ADAPTIVE_POLICY_VERSION,
  type LearningBehavior,
  type StudentGlobalState,
  type TopicMasteryState,
  type TopicStatus,
  type DifficultyLevel,
  type TeachingMode,
} from "@/lib/adaptive/types";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import { forecastFromState } from "@/lib/adaptive/readiness";

export type StudentStateBundle = {
  global: StudentGlobalState;
  topics: TopicMasteryState[];
  graph: ExamGraph;
  behavior: LearningBehavior;
};

function daysUntil(examDate: string | null): number | null {
  if (!examDate) return null;
  const end = new Date(`${examDate}T23:59:59`);
  const ms = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export async function loadStudentState(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
): Promise<StudentStateBundle | null> {
  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, exam_date, target_score, daily_minutes, study_days, adaptive_plan_version, learning_tracking, schedule_v2",
    )
    .eq("id", examPrepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prep) return null;

  const graph = await loadExamGraph(service, examPrepId);

  const { data: masteryRows } = await service
    .from("exam_prep_topic_mastery")
    .select(
      "topic_key, mastery, mastery_confidence, status, review_due_at, streak_correct, repeated_error_count, current_difficulty, behavior, evidence_count, measured_level, confidence, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at",
    )
    .eq("user_id", userId)
    .eq("exam_prep_id", examPrepId);

  const byKey = new Map(
    (masteryRows ?? []).map((r) => [normalizeTopicKey(r.topic_key), r]),
  );

  const topics: TopicMasteryState[] = graph.topics.map((t) => {
    const row = byKey.get(t.topicKey);
    if (!row) {
      return seedFromMeasuredLevel(
        t.topicId,
        t.topicKey,
        (t.measuredLevel as "weak" | "emerging" | "solid" | null) ?? null,
      );
    }
    const mastery =
      typeof row.mastery === "number" && row.mastery > 0
        ? Number(row.mastery)
        : seedFromMeasuredLevel(
            t.topicId,
            t.topicKey,
            (row.measured_level as "weak" | "emerging" | "solid" | null) ??
              null,
          ).mastery;
    const masteryConfidence =
      typeof row.mastery_confidence === "number" && row.mastery_confidence > 0
        ? Number(row.mastery_confidence)
        : Math.min(1, Number(row.confidence ?? 0) / 100);
    const status = (row.status as TopicStatus) || "unseen";
    const firstTotal = Number(row.first_attempt_total ?? 0);
    const indTotal = Number(row.independent_total ?? 0);
    return {
      topicId: t.topicId,
      topicKey: t.topicKey,
      mastery,
      masteryConfidence,
      evidenceCount: Number(row.evidence_count ?? 0),
      recentAccuracy:
        firstTotal > 0
          ? Number(row.first_attempt_correct ?? 0) / firstTotal
          : null,
      independentAccuracy:
        indTotal > 0
          ? Number(row.independent_correct ?? 0) / indTotal
          : null,
      examLevelAccuracy: null,
      currentDifficulty: (row.current_difficulty as DifficultyLevel) || "medium",
      lastStudiedAt: (row.last_practiced_at as string) ?? null,
      lastAssessedAt: (row.last_practiced_at as string) ?? null,
      reviewDueAt: (row.review_due_at as string) ?? null,
      streakCorrect: Number(row.streak_correct ?? 0),
      repeatedErrorCount: Number(row.repeated_error_count ?? 0),
      misconceptionFlags: [],
      prerequisiteRisk: false,
      status: status === "unseen" && Number(row.evidence_count ?? 0) > 0
        ? "learning"
        : status,
    };
  });

  const tracking = (prep.learning_tracking ?? {}) as {
    examReadinessPct?: number;
    programProgressPct?: number;
  };
  const daysRemaining = daysUntil(prep.exam_date as string | null);
  const readinessPct =
    typeof tracking.examReadinessPct === "number"
      ? tracking.examReadinessPct
      : null;
  const progressPct =
    typeof tracking.programProgressPct === "number"
      ? tracking.programProgressPct
      : null;

  const global: StudentGlobalState = {
    examPrepId,
    examDate: (prep.exam_date as string) ?? null,
    targetScore:
      typeof prep.target_score === "number" ? prep.target_score : null,
    dailyMinutes:
      typeof prep.daily_minutes === "number" ? prep.daily_minutes : null,
    studyDays: Array.isArray(prep.study_days)
      ? (prep.study_days as number[])
      : [],
    planStartDate: null,
    planVersion: Number(prep.adaptive_plan_version ?? 0),
    daysRemaining,
    progressPct,
    readinessPct,
    forecast: forecastFromState({
      readinessPct,
      daysRemaining,
      behindSchedule: false,
      openHighSeverityGaps: topics.filter((t) => t.repeatedErrorCount >= 2)
        .length,
    }),
    policyVersion: ADAPTIVE_POLICY_VERSION,
  };

  const behaviorRow = (masteryRows ?? []).find(
    (r) => r.behavior && typeof r.behavior === "object",
  );
  const behaviorJson =
    behaviorRow?.behavior && typeof behaviorRow.behavior === "object"
      ? (behaviorRow.behavior as Record<string, unknown>)
      : {};

  const preferred =
    typeof behaviorJson.preferredEffectiveFormat === "string"
      ? (behaviorJson.preferredEffectiveFormat as TeachingMode)
      : null;

  const behavior: LearningBehavior = {
    workedExampleSuccess: Number(behaviorJson.workedExampleSuccess ?? 0),
    retrievalSuccess: Number(behaviorJson.retrievalSuccess ?? 0),
    averageHintDependency: Number(behaviorJson.averageHintDependency ?? 0),
    preferredEffectiveFormat: preferred,
    sessionCompletionRate: Number(behaviorJson.sessionCompletionRate ?? 0),
  };

  return { global, topics, graph, behavior };
}

export async function persistTopicMastery(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
  state: TopicMasteryState,
  discreteLevel: "unmeasured" | "weak" | "emerging" | "solid",
): Promise<void> {
  const confidencePct = Math.round(state.masteryConfidence * 100);
  await service.from("exam_prep_topic_mastery").upsert(
    {
      user_id: userId,
      exam_prep_id: examPrepId,
      topic_key: state.topicKey,
      mastery: state.mastery,
      mastery_confidence: state.masteryConfidence,
      status: state.status,
      review_due_at: state.reviewDueAt,
      streak_correct: state.streakCorrect,
      repeated_error_count: state.repeatedErrorCount,
      current_difficulty: state.currentDifficulty,
      measured_level: discreteLevel,
      confidence: confidencePct,
      evidence_count: state.evidenceCount,
      last_practiced_at: state.lastStudiedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,exam_prep_id,topic_key" },
  );
}

export function topicByKey(
  topics: TopicMasteryState[],
  key: string,
): TopicMasteryState | undefined {
  const k = normalizeTopicKey(key);
  return topics.find((t) => t.topicKey === k);
}
