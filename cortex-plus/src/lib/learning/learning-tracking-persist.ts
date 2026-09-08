/**
 * Stage 6 persistence helpers — only called when pdf_learning_v2 is ON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanNodeKind, NodeStatus } from "@/lib/learning/exam-prep-plan";
import {
  buildLearningIndicators,
  extractAnswerEvidence,
  foldTopicMastery,
  preferNextNodeForTracking,
  stripAnswerMeta,
  toPersistedTracking,
  weakOrStaleTopicKeys,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";

export async function countPriorCompletedAttempts(
  service: SupabaseClient,
  input: { userId: string; prepId: string; nodeId: string; excludeAttemptId?: string },
): Promise<number> {
  let q = service
    .from("exam_prep_node_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("node_id", input.nodeId)
    .eq("status", "completed");
  if (input.excludeAttemptId) {
    q = q.neq("id", input.excludeAttemptId);
  }
  const { count } = await q;
  return count ?? 0;
}

export async function recordLearningTrackingAfterComplete(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    nodeId: string;
    attemptId: string;
    kind: PlanNodeKind;
    payload: unknown;
    answers: Record<string, unknown>;
    topicLabel: string | null;
    sessionObjective: string | null;
    targetScore: number | null;
  },
): Promise<{ nextNodeId: string | null; tracking: ReturnType<typeof toPersistedTracking> }> {
  const priorCount = await countPriorCompletedAttempts(service, {
    userId: input.userId,
    prepId: input.prepId,
    nodeId: input.nodeId,
    excludeAttemptId: input.attemptId,
  });
  const isFirstAttempt = priorCount === 0;
  const attemptOrdinal = priorCount + 1;

  const evidence = extractAnswerEvidence({
    kind: input.kind,
    payload: input.payload,
    answers: input.answers,
    topicLabel: input.topicLabel,
    sessionObjective: input.sessionObjective,
    isFirstAttempt,
  });

  await service
    .from("exam_prep_node_attempts")
    .update({
      attempt_ordinal: attemptOrdinal,
      answer_meta: {
        hintsUsed: (input.answers.__meta as { hintsUsed?: unknown } | undefined)?.hintsUsed ??
          input.answers.__hints ??
          {},
        isFirstAttempt,
      },
    })
    .eq("id", input.attemptId);

  if (evidence.length) {
    await service.from("exam_prep_answer_evidence").insert(
      evidence.map((row) => ({
        user_id: input.userId,
        exam_prep_id: input.prepId,
        node_id: input.nodeId,
        attempt_id: input.attemptId,
        topic_key: row.topicKey,
        learning_objective: row.learningObjective,
        question_index: row.questionIndex,
        correct: row.correct,
        is_first_attempt: row.isFirstAttempt,
        hint_assisted: row.hintAssisted,
        independent_success: row.independentSuccess,
        wrong_type: row.wrongType,
        source_kind: row.sourceKind,
        question_preview: row.questionPreview,
      })),
    );
  }

  const { data: masteryRows } = await service
    .from("exam_prep_topic_mastery")
    .select(
      "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at",
    )
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId);

  const prior: TopicMasterySnapshot[] = (masteryRows ?? []).map((row) => ({
    topicKey: row.topic_key as string,
    measured: (row.evidence_count as number) > 0,
    level: row.measured_level as TopicMasterySnapshot["level"],
    confidence: Number(row.confidence ?? 0),
    evidenceCount: Number(row.evidence_count ?? 0),
    firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
    firstAttemptTotal: Number(row.first_attempt_total ?? 0),
    independentCorrect: Number(row.independent_correct ?? 0),
    independentTotal: Number(row.independent_total ?? 0),
    lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
  }));

  const folded = foldTopicMastery(evidence, prior);

  for (const topic of folded) {
    if (!topic.measured && topic.evidenceCount === 0) continue;
    await service.from("exam_prep_topic_mastery").upsert(
      {
        user_id: input.userId,
        exam_prep_id: input.prepId,
        topic_key: topic.topicKey,
        measured_level: topic.level,
        confidence: topic.confidence,
        evidence_count: topic.evidenceCount,
        first_attempt_correct: topic.firstAttemptCorrect,
        first_attempt_total: topic.firstAttemptTotal,
        independent_correct: topic.independentCorrect,
        independent_total: topic.independentTotal,
        last_practiced_at: topic.lastPracticedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,exam_prep_id,topic_key" },
    );
  }

  const { data: nodeRows } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, sort_order, session_meta")
    .eq("exam_prep_id", input.prepId)
    .order("sort_order");

  const nodes = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    status: row.status as NodeStatus,
    sortOrder: row.sort_order as number,
    sessionMeta:
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as { topicTitle?: string })
        : null,
  }));

  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", input.prepId);

  const plannedTopicKeys = (topicRows ?? [])
    .map((t) => String(t.label ?? "").trim())
    .filter(Boolean);

  const { count: misconceptionCount } = await service
    .from("exam_prep_misconceptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId);

  const mockNode = nodes.find((n) => n.kind === "written_exam" && n.status === "done");
  let mockScorePct: number | null = null;
  if (mockNode) {
    const { data: mockAttempt } = await service
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("node_id", mockNode.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mockAttempt?.total) {
      mockScorePct = Math.round(
        (Number(mockAttempt.score ?? 0) / Number(mockAttempt.total)) * 100,
      );
    }
  }

  const indicators = buildLearningIndicators({
    nodes,
    topics: folded,
    plannedTopicKeys,
    mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions: misconceptionCount ?? 0,
  });
  const tracking = toPersistedTracking(indicators);

  await service
    .from("exam_preps")
    .update({
      learning_tracking: tracking,
      // Keep legacy column as program progress only (not "ready" claim).
      readiness_score: tracking.programProgressPct,
    })
    .eq("id", input.prepId)
    .eq("user_id", input.userId);

  const next = preferNextNodeForTracking(nodes, {
    openMisconceptions: misconceptionCount ?? 0,
    weakOrStaleTopicKeys: weakOrStaleTopicKeys(folded),
  });

  return { nextNodeId: next?.id ?? null, tracking };
}

export { stripAnswerMeta };
