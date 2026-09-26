/**
 * LearningGovernor — single entry for next pedagogical action.
 * Frontend only renders the result.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  ADAPTIVE_MODEL_ROUTER_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import {
  examPhaseFromDays,
  filterActionsForExamPhase,
} from "@/lib/adaptive/exam-phase";
import { buildDecisionState } from "@/lib/adaptive/jev/build-decision-state";
import {
  decideNextActions,
  recordPolicyOutcome,
} from "@/lib/adaptive/jev/decision-service";
import {
  applyPolicyToDecision,
  escalateTeachingMode,
  filterCandidateActions,
  hasRepeatedInterventionFailure,
  type RecentActionTrace,
} from "@/lib/adaptive/policy-engine";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import { reasonCopy } from "@/lib/adaptive/reason-copy";
import { loadStudentState } from "@/lib/adaptive/student-state";
import { routeTutorModel } from "@/lib/adaptive/tutor-model-router";
import type {
  GovernorAction,
  LearningAction,
  ReasonCode,
  TeachingMode,
  TopicMasteryState,
} from "@/lib/adaptive/types";
import { prerequisitesMet } from "@/lib/adaptive/exam-graph";

export type GovernorContext = {
  lastAnswerCorrect?: boolean | null;
  hintCount?: number;
  repeatedMisconception?: boolean;
  todayTarget?: string;
  behindSchedule?: boolean;
  sessionMinutesRemaining?: number;
  fatigueSignal?: number;
  planTopicKeys?: string[];
  hasComplexVisual?: boolean;
  advancedReasoning?: boolean;
  highImpactAssessment?: boolean;
  conflictingEvidence?: boolean;
  /** Recent actions in this session for anti-loop (newest last). */
  recentActions?: RecentActionTrace[];
  progressMade?: boolean;
};

async function loadRecentActions(
  service: SupabaseClient,
  sessionId: string | null,
): Promise<RecentActionTrace[]> {
  if (!sessionId) return [];
  const { data } = await service
    .from("adaptive_learning_events")
    .select("event_type, topic_key, payload")
    .eq("session_id", sessionId)
    .in("event_type", ["jev_decision", "lesson_started", "question_presented"])
    .order("created_at", { ascending: false })
    .limit(12);
  const out: RecentActionTrace[] = [];
  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as { action?: string };
    const action = payload.action as LearningAction | undefined;
    const topicKey = (row.topic_key as string) || "";
    if (action && topicKey) {
      out.push({ action, topicKey });
    }
  }
  return out.reverse();
}

function pickReason(
  topic: TopicMasteryState,
  action: string,
  behind: boolean,
  reviewDue: boolean,
  prereqGap: boolean,
  highWeight: boolean,
): ReasonCode {
  if (prereqGap) return "PREREQUISITE_GAP";
  if (topic.repeatedErrorCount >= 2) return "REPEATED_MISCONCEPTION";
  if (reviewDue) return "REVIEW_DUE";
  if (behind) return "PLAN_BEHIND";
  if (highWeight) return "EXAM_HIGH_WEIGHT_TOPIC";
  if (topic.mastery < 0.45) return "LOW_MASTERY";
  if (action === "scheduled_review") return "REVIEW_DUE";
  return "PLAN_OBJECTIVE";
}

export async function nextAction(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
  sessionId: string | null,
  ctx: GovernorContext = {},
): Promise<GovernorAction | null> {
  const bundle = await loadStudentState(service, userId, examPrepId);
  if (!bundle) return null;

  const candidates = prioritizeTopics({
    graph: bundle.graph,
    topics: bundle.topics,
    planTopicKeys: ctx.planTopicKeys,
    daysRemaining: bundle.global.daysRemaining,
  });

  if (!candidates.length) return null;

  const top = candidates[0]!;
  const topic =
    bundle.topics.find((t) => t.topicKey === top.topicKey) ??
    ({
      topicId: top.topicId,
      topicKey: top.topicKey,
      mastery: 0,
      masteryConfidence: 0,
      evidenceCount: 0,
      recentAccuracy: null,
      independentAccuracy: null,
      examLevelAccuracy: null,
      currentDifficulty: "medium" as const,
      lastStudiedAt: null,
      lastAssessedAt: null,
      reviewDueAt: null,
      streakCorrect: 0,
      repeatedErrorCount: 0,
      misconceptionFlags: [],
      prerequisiteRisk: false,
      status: "unseen" as const,
    } satisfies TopicMasteryState);

  const masteryByKey = new Map(
    bundle.topics.map((t) => [
      t.topicKey,
      { mastery: t.mastery, status: t.status },
    ]),
  );

  const reviewDue = Boolean(
    topic.reviewDueAt && new Date(topic.reviewDueAt).getTime() <= Date.now(),
  );
  const sessionMinutes =
    ctx.sessionMinutesRemaining ??
    Math.max(10, bundle.global.dailyMinutes ?? 45);

  const recentActions =
    ctx.recentActions ?? (await loadRecentActions(service, sessionId));

  let allowedActions = filterCandidateActions({
    sessionMinutesRemaining: sessionMinutes,
    topic,
    graph: bundle.graph,
    masteryByKey,
    reviewDue,
    lastAnswerCorrect: ctx.lastAnswerCorrect ?? null,
    repeatedMisconception:
      ctx.repeatedMisconception ?? topic.repeatedErrorCount >= 2,
    recentActions,
    progressMade: ctx.progressMade ?? ctx.lastAnswerCorrect === true,
  });

  const phase = examPhaseFromDays(bundle.global.daysRemaining);
  allowedActions = filterActionsForExamPhase(
    allowedActions,
    phase,
    topic.mastery,
  );

  const prereqGapEarly = !prerequisitesMet(
    bundle.graph,
    topic.topicKey,
    masteryByKey,
  );
  const independentEvidence = Math.round(
    (topic.independentAccuracy ?? 0) * Math.max(0, topic.evidenceCount),
  );
  const progressMade = ctx.progressMade ?? ctx.lastAnswerCorrect === true;

  const state = buildDecisionState({
    examDaysRemaining: bundle.global.daysRemaining ?? 30,
    sessionMinutesRemaining: sessionMinutes,
    fatigueSignal: ctx.fatigueSignal,
    topic,
    lastAnswerCorrect: ctx.lastAnswerCorrect ?? null,
    hintCount: ctx.hintCount ?? 0,
    repeatedMisconception:
      ctx.repeatedMisconception ?? topic.repeatedErrorCount >= 2,
    todayTarget: ctx.todayTarget ?? top.title,
    behindSchedule: ctx.behindSchedule ?? false,
    allowedActions,
    candidateTopics: candidates.map((c) => ({
      topic_id: c.topicId,
      priority: Number(c.priority.toFixed(3)),
    })),
    reviewDue,
    prerequisiteStatus: prereqGapEarly ? "blocked" : "met",
    independentEvidence,
  });

  const decision = await decideNextActions({
    service,
    state,
    userId,
    examPrepId,
    sessionId,
    hints: {
      complexMisconception: topic.repeatedErrorCount >= 3,
      conflictingEvidence: ctx.conflictingEvidence === true,
      repeatedInterventionFailure: hasRepeatedInterventionFailure({
        recent: recentActions,
        topicKey: topic.topicKey,
        progressMade,
      }),
      complexReasoning: ctx.advancedReasoning === true,
      highImpactAssessment: ctx.highImpactAssessment === true,
    },
  });

  const policy = applyPolicyToDecision({
    decision,
    allowedActions,
    topic,
    graph: bundle.graph,
    masteryByKey,
  });

  // Prefer format that worked before when available; else escalate on struggle.
  let teachingMode: TeachingMode = policy.teachingMode;
  if (bundle.behavior.preferredEffectiveFormat && topic.repeatedErrorCount < 2) {
    teachingMode = bundle.behavior.preferredEffectiveFormat;
  } else {
    teachingMode = escalateTeachingMode(
      teachingMode,
      topic.repeatedErrorCount,
    );
  }

  const decisionTraceId = randomUUID();
  void recordPolicyOutcome(service, decision.auditId, {
    overridden: policy.overridden,
    overrideReason: policy.overrideReason,
    finalAction: policy.action,
    teachingMode,
    decisionTraceId,
  });

  const routerEnabled = await isFeatureEnabled(
    service,
    ADAPTIVE_MODEL_ROUTER_FLAG,
    userId,
  );
  // Content model selection stays independent of the decision provider and
  // of whether the decision itself was escalated to GPT-4o.
  const routed = routeTutorModel({
    routerEnabled,
    jevNeedsGpt4o: policy.needsGpt4o,
    hasComplexVisual: ctx.hasComplexVisual,
    advancedReasoning: ctx.advancedReasoning,
    repeatedConfusion: topic.repeatedErrorCount >= 2,
    highImpactAssessment: ctx.highImpactAssessment,
  });

  const graphTopic = bundle.graph.topics.find((t) => t.topicKey === topic.topicKey);
  const prereqGap = !prerequisitesMet(
    bundle.graph,
    topic.topicKey,
    masteryByKey,
  );
  const highWeight =
    graphTopic?.importance === "important" ||
    (graphTopic?.weightPercent ?? 0) >= 15;

  const code = pickReason(
    topic,
    policy.action,
    ctx.behindSchedule ?? false,
    reviewDue,
    prereqGap,
    highWeight,
  );

  const durationTarget =
    policy.action === "teach"
      ? Math.min(20, sessionMinutes)
      : policy.action === "mini_assessment"
        ? Math.min(10, sessionMinutes)
        : policy.action === "scheduled_review"
          ? Math.min(8, sessionMinutes)
          : Math.min(15, sessionMinutes);

  // Persist decision action on session events for anti-loop (best-effort).
  if (sessionId) {
    void service.from("adaptive_learning_events").insert({
      user_id: userId,
      exam_prep_id: examPrepId,
      session_id: sessionId,
      event_type: "jev_decision",
      topic_key: topic.topicKey,
      payload: {
        action: policy.action,
        teachingMode,
        difficulty: policy.difficulty,
        decisionTraceId,
        phase,
        overridden: policy.overridden,
        overrideReason: policy.overrideReason,
      },
    });
  }

  return {
    action: policy.action,
    topicId: topic.topicId || top.topicId,
    topicKey: topic.topicKey,
    subtopicId: null,
    teachingMode,
    difficulty: policy.difficulty,
    model: routed.model,
    durationTarget,
    sourceRefs: graphTopic?.sourceRefs ?? [],
    reasonCode: code,
    reasonCopy: reasonCopy(code),
    decisionTraceId,
    href: `/deneme-sinavlari/${examPrepId}/oturum?topic=${encodeURIComponent(topic.topicKey)}`,
  };
}

/** Student-safe action payload — no model/provider internals. */
export function toStudentActionPayload(action: GovernorAction) {
  const { model: _model, ...rest } = action;
  return rest;
}
