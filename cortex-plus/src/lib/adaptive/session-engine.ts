/**
 * Session engine — start / evidence / complete with idempotent events.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyMasteryEvidence,
} from "@/lib/adaptive/mastery-engine";
import { classifyKnowledgeGap } from "@/lib/adaptive/knowledge-gap";
import { nextReviewIntervalDays } from "@/lib/adaptive/review-scheduler";
import {
  loadStudentState,
  persistTopicMastery,
} from "@/lib/adaptive/student-state";
import { nextAction, type GovernorContext } from "@/lib/adaptive/learning-governor";
import {
  ADAPTIVE_POLICY_VERSION,
  type DifficultyLevel,
  type GovernorAction,
  type LearningEventType,
  type LearningEvidence,
  type SessionState,
} from "@/lib/adaptive/types";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";

export async function getActiveSession(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
): Promise<SessionState | null> {
  const { data } = await service
    .from("adaptive_learning_sessions")
    .select(
      "id, exam_prep_id, started_at, planned_duration_minutes, objective, current_topic_id, current_step, completion_pct, status",
    )
    .eq("user_id", userId)
    .eq("exam_prep_id", examPrepId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    examPrepId: data.exam_prep_id as string,
    startedAt: data.started_at as string,
    plannedDurationMinutes: Number(data.planned_duration_minutes ?? 45),
    objective: String(data.objective ?? ""),
    currentTopicId: (data.current_topic_id as string) ?? null,
    currentStep: Number(data.current_step ?? 0),
    completionPct: Number(data.completion_pct ?? 0),
    status: "active",
  };
}

export async function startSession(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    plannedDurationMinutes?: number;
    objective?: string;
  },
): Promise<{ session: SessionState; action: GovernorAction | null }> {
  const existing = await getActiveSession(
    service,
    input.userId,
    input.examPrepId,
  );
  if (existing) {
    const action = await nextAction(
      service,
      input.userId,
      input.examPrepId,
      existing.id,
      { sessionMinutesRemaining: existing.plannedDurationMinutes },
    );
    return { session: existing, action };
  }

  const planned = input.plannedDurationMinutes ?? 45;
  const { data, error } = await service
    .from("adaptive_learning_sessions")
    .insert({
      user_id: input.userId,
      exam_prep_id: input.examPrepId,
      planned_duration_minutes: planned,
      objective: input.objective ?? "Bugünkü çalışma",
      status: "active",
      policy_version: ADAPTIVE_POLICY_VERSION,
    })
    .select(
      "id, exam_prep_id, started_at, planned_duration_minutes, objective, current_topic_id, current_step, completion_pct, status",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "session_start_failed");
  }

  const session: SessionState = {
    id: data.id as string,
    examPrepId: data.exam_prep_id as string,
    startedAt: data.started_at as string,
    plannedDurationMinutes: Number(data.planned_duration_minutes ?? planned),
    objective: String(data.objective ?? ""),
    currentTopicId: null,
    currentStep: 0,
    completionPct: 0,
    status: "active",
  };

  await appendEvent(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: session.id,
    eventType: "session_started",
    payload: { plannedDurationMinutes: planned },
  });

  const action = await nextAction(
    service,
    input.userId,
    input.examPrepId,
    session.id,
    { sessionMinutesRemaining: planned, todayTarget: session.objective },
  );

  if (action) {
    await service
      .from("adaptive_learning_sessions")
      .update({
        current_topic_id: action.topicId || null,
        current_topic_key: action.topicKey,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);
  }

  return { session, action };
}

export async function submitEvidence(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string;
    evidence: LearningEvidence;
    misconceptionSeverity?: number;
    ctx?: GovernorContext;
  },
): Promise<{
  duplicate: boolean;
  mastery: number;
  action: GovernorAction | null;
}> {
  const inserted = await appendEvent(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: input.sessionId,
    eventType: "answer_submitted",
    topicKey: input.evidence.topicKey,
    payload: { evidence: input.evidence },
    idempotencyKey: input.evidence.idempotencyKey,
  });

  if (!inserted) {
    const action = await nextAction(
      service,
      input.userId,
      input.examPrepId,
      input.sessionId,
      input.ctx,
    );
    return { duplicate: true, mastery: 0, action };
  }

  const bundle = await loadStudentState(
    service,
    input.userId,
    input.examPrepId,
  );
  if (!bundle) {
    return { duplicate: false, mastery: 0, action: null };
  }

  const key = normalizeTopicKey(input.evidence.topicKey);
  let topic = bundle.topics.find((t) => t.topicKey === key);
  if (!topic) {
    topic = {
      topicId: input.evidence.topicId,
      topicKey: key,
      mastery: 0,
      masteryConfidence: 0,
      evidenceCount: 0,
      recentAccuracy: null,
      independentAccuracy: null,
      examLevelAccuracy: null,
      currentDifficulty: input.evidence.difficulty,
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

  const gap = classifyKnowledgeGap({
    correct: input.evidence.correct,
    hintUsed: input.evidence.hintUsed,
    retry: input.evidence.retry,
    misconceptionTag: input.evidence.misconceptionTag,
    misconceptionSeverity: input.misconceptionSeverity ?? 0,
    repeatedErrorCount: topic.repeatedErrorCount,
  });

  const evidence: LearningEvidence = {
    ...input.evidence,
    topicKey: key,
    gapKind: gap,
  };

  const updated = applyMasteryEvidence(topic, evidence);
  await persistTopicMastery(
    service,
    input.userId,
    input.examPrepId,
    updated.next,
    updated.discreteLevel,
  );

  await appendEvent(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: input.sessionId,
    eventType: "mastery_updated",
    topicKey: key,
    payload: {
      mastery: updated.next.mastery,
      delta: updated.delta,
      gap,
    },
  });

  // Schedule spaced review only on mastery or successful delayed retrieval —
  // not on every single correct answer.
  const shouldScheduleReview =
    evidence.correct &&
    (updated.next.status === "mastered" ||
      evidence.retrievalAfterDelay ||
      (updated.next.mastery >= 0.75 &&
        updated.next.masteryConfidence >= 0.65 &&
        updated.next.evidenceCount >= 4));

  if (shouldScheduleReview) {
    const { data: priorReview } = await service
      .from("adaptive_scheduled_reviews")
      .select("interval_days")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.examPrepId)
      .eq("topic_key", key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentInterval = Number(priorReview?.interval_days ?? 1);
    const review = nextReviewIntervalDays({
      currentIntervalDays: currentInterval,
      success: evidence.correct,
      examDate: bundle.global.examDate,
    });
    updated.next.reviewDueAt = review.dueAt.toISOString();
    await service
      .from("adaptive_scheduled_reviews")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.examPrepId)
      .eq("topic_key", key)
      .eq("status", "pending");
    await service.from("adaptive_scheduled_reviews").insert({
      user_id: input.userId,
      exam_prep_id: input.examPrepId,
      topic_key: key,
      topic_id: updated.next.topicId || null,
      due_at: review.dueAt.toISOString(),
      interval_days: review.intervalDays,
      last_result: "success",
      status: "pending",
    });
    await persistTopicMastery(
      service,
      input.userId,
      input.examPrepId,
      updated.next,
      updated.discreteLevel,
    );
  }

  const { data: sess } = await service
    .from("adaptive_learning_sessions")
    .select("current_step, planned_duration_minutes")
    .eq("id", input.sessionId)
    .maybeSingle();
  const step = Number(sess?.current_step ?? 0) + 1;
  await service
    .from("adaptive_learning_sessions")
    .update({
      current_step: step,
      completion_pct: Math.min(100, step * 10),
      current_topic_key: key,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId);

  const action = await nextAction(
    service,
    input.userId,
    input.examPrepId,
    input.sessionId,
    {
      ...input.ctx,
      lastAnswerCorrect: evidence.correct,
      repeatedMisconception: updated.next.repeatedErrorCount >= 2,
      sessionMinutesRemaining: Number(sess?.planned_duration_minutes ?? 45),
    },
  );

  return { duplicate: false, mastery: updated.next.mastery, action };
}

export async function completeSession(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string;
    abandoned?: boolean;
  },
): Promise<{ summary: import("@/lib/adaptive/types").SessionCompletionSummary }> {
  const status = input.abandoned ? "abandoned" : "completed";
  await service
    .from("adaptive_learning_sessions")
    .update({
      status,
      ended_at: new Date().toISOString(),
      completion_pct: input.abandoned ? undefined : 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId);

  await appendEvent(service, {
    userId: input.userId,
    examPrepId: input.examPrepId,
    sessionId: input.sessionId,
    eventType: input.abandoned ? "session_abandoned" : "session_completed",
    payload: {},
  });

  const summary = await buildSessionSummary(service, input);

  // Refresh daily plan after session (lazy, no cron).
  try {
    const { ensureCurrentDailyPlan } = await import(
      "@/lib/adaptive/daily-planner"
    );
    await ensureCurrentDailyPlan(service, {
      userId: input.userId,
      examPrepId: input.examPrepId,
      forceRefresh: true,
    });
  } catch {
    // never block completion
  }

  return { summary };
}

async function buildSessionSummary(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string;
  },
): Promise<import("@/lib/adaptive/types").SessionCompletionSummary> {
  const { data: events } = await service
    .from("adaptive_learning_events")
    .select("event_type, topic_key, payload")
    .eq("session_id", input.sessionId)
    .eq("user_id", input.userId);

  const masteryGained: { topicKey: string; delta: number }[] = [];
  const objectives = new Set<string>();
  for (const e of events ?? []) {
    if (e.topic_key) objectives.add(String(e.topic_key));
    if (e.event_type === "mastery_updated" && e.payload && typeof e.payload === "object") {
      const p = e.payload as { mastery?: number; delta?: number };
      if (e.topic_key && typeof p.delta === "number") {
        masteryGained.push({ topicKey: String(e.topic_key), delta: p.delta });
      }
    }
  }

  const bundle = await loadStudentState(
    service,
    input.userId,
    input.examPrepId,
  );
  const weak = bundle?.topics
    .filter((t) => t.mastery < 0.5)
    .sort((a, b) => a.mastery - b.mastery)[0];

  const { data: reviews } = await service
    .from("adaptive_scheduled_reviews")
    .select("topic_key, due_at")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.examPrepId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(3);

  const { istanbulToday } = await import("@/lib/adaptive/daily-planner");
  const today = istanbulToday();
  let nextStudyDay: string | null = today;
  const studyDays = bundle?.global.studyDays ?? [1, 2, 3, 4, 5];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (studyDays.includes(dow)) {
      nextStudyDay = d.toISOString().slice(0, 10);
      break;
    }
  }

  const steps = (events ?? []).filter((e) =>
    ["answer_submitted", "intervention_started", "mastery_updated"].includes(
      String(e.event_type),
    ),
  ).length;

  return {
    objectivesCompleted: [...objectives].slice(0, 5),
    masteryGained: masteryGained.slice(0, 5),
    remainingWeakPoint: weak
      ? bundle?.graph.topics.find((g) => g.topicKey === weak.topicKey)?.title ??
        weak.topicKey
      : null,
    scheduledReviews: (reviews ?? []).map((r) => ({
      topicKey: String(r.topic_key),
      dueAt: String(r.due_at),
    })),
    nextStudyDay,
    todayProgressPct: Math.min(100, steps * 15),
    message: weak
      ? `Bugün kaydedildi. ${weak.topicKey} için ek tekrar planlandı.`
      : "Bugün kaydedildi. Cortex durumunu biliyor; yarın kaldığın yerden devam.",
  };
}

async function appendEvent(
  service: SupabaseClient,
  input: {
    userId: string;
    examPrepId: string;
    sessionId: string;
    eventType: LearningEventType;
    topicKey?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<boolean> {
  if (input.idempotencyKey) {
    const { data: existing } = await service
      .from("adaptive_learning_events")
      .select("id")
      .eq("user_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) return false;
  }

  const { error } = await service.from("adaptive_learning_events").insert({
    user_id: input.userId,
    exam_prep_id: input.examPrepId,
    session_id: input.sessionId,
    event_type: input.eventType,
    topic_key: input.topicKey ?? null,
    payload: input.payload ?? {},
    idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    // Unique violation = duplicate
    if (String(error.code) === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

export function parseDifficulty(raw: unknown): DifficultyLevel {
  const v = String(raw ?? "medium");
  if (
    v === "foundation" ||
    v === "easy" ||
    v === "medium" ||
    v === "hard" ||
    v === "exam_level"
  ) {
    return v;
  }
  return "medium";
}
