import { notFound, redirect } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepAssessment } from "@/components/parity/exam-prep-assessment";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import {
  daysUntilExam,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  examPrepTopicHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";
import {
  buildLearningIndicators,
  preferNextNodeForTracking,
  weakOrStaleTopicKeys,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";

export const metadata = { title: "Sınav öncesi değerlendirme" };
export const dynamic = "force-dynamic";

export default async function ExamPrepAssessmentPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    redirect(`/deneme-sinavlari/${prepId}`);
  }

  const { data: prep } = await supabase
    .from("exam_preps")
    .select(
      "id, title, exam_type, exam_date, active_topic_id, intro_completed_at, target_score",
    )
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("id, kind, title, day_index, sort_order, status, session_meta")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const nodes = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    title: row.title as string,
    dayIndex: row.day_index as number,
    sortOrder: row.sort_order as number,
    status: row.status as "locked" | "ready" | "done",
    sessionMeta:
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as { role?: string; topicTitle?: string })
        : null,
  }));

  const { data: masteryRows } = await supabase
    .from("exam_prep_topic_mastery")
    .select(
      "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at",
    )
    .eq("exam_prep_id", prepId);

  const { data: topicRows } = await supabase
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", prepId);

  const { count: misconceptionCount } = await supabase
    .from("exam_prep_misconceptions")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", prepId);

  const topics: TopicMasterySnapshot[] = (masteryRows ?? []).map((row) => ({
    topicKey: row.topic_key as string,
    measured: Number(row.evidence_count ?? 0) > 0,
    level: row.measured_level as TopicMasterySnapshot["level"],
    confidence: Number(row.confidence ?? 0),
    evidenceCount: Number(row.evidence_count ?? 0),
    firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
    firstAttemptTotal: Number(row.first_attempt_total ?? 0),
    independentCorrect: Number(row.independent_correct ?? 0),
    independentTotal: Number(row.independent_total ?? 0),
    lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
  }));

  const plannedTopicKeys = (topicRows ?? [])
    .map((t) => String(t.label ?? "").trim())
    .filter(Boolean);

  const mockNode =
    nodes.find((n) => n.kind === "written_exam" && n.status === "ready") ??
    nodes.find((n) => n.kind === "written_exam");
  const mockDone = nodes.find(
    (n) => n.kind === "written_exam" && n.status === "done",
  );
  let mockScorePct: number | null = null;
  if (mockDone) {
    const { data: mockAttempt } = await supabase
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("node_id", mockDone.id)
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

  const openMisconceptions = misconceptionCount ?? 0;
  const indicators = buildLearningIndicators({
    nodes,
    topics,
    plannedTopicKeys,
    mockScorePct,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
    openMisconceptions,
  });

  const hasTopic = Boolean(prep.active_topic_id);
  const needsIntro = hasTopic && needsExamIntro(prep.intro_completed_at, nodes);
  const ready =
    preferNextNodeForTracking(nodes, {
      openMisconceptions,
      weakOrStaleTopicKeys: weakOrStaleTopicKeys(topics),
    }) ?? nodes.find((n) => n.status === "ready");

  const nextHref = !hasTopic
    ? examPrepTopicHref(prepId)
    : needsIntro
      ? examPrepIntroHref(prepId)
      : ready
        ? examPrepNodeHref(prepId, ready.id)
        : examPrepHomeHref(prepId);

  return (
    <AstraParitySorShell {...shell}>
      <ExamPrepAssessment
        prepId={prepId}
        title={prep.title ?? prep.exam_type}
        examDate={prep.exam_date}
        daysLeft={prep.exam_date ? daysUntilExam(prep.exam_date) : null}
        tracking={{
          programProgressPct: indicators.programProgress.pct,
          programLabel: indicators.programProgress.label,
          topicMasteryPct: indicators.topicMastery.pct,
          topicMasteryLabel: indicators.topicMastery.label,
          measuredTopicCount: indicators.topicMastery.measuredCount,
          unmeasuredTopicCount: indicators.topicMastery.unmeasuredCount,
          examReadinessPct: indicators.examReadiness.pct,
          examReadinessLabel: indicators.examReadiness.label,
          claimFullyReady: indicators.examReadiness.claimFullyReady,
        }}
        topics={topics.map((t) => ({
          topicKey: t.topicKey,
          measured: t.measured,
          level: t.level,
          confidence: t.confidence,
          evidenceCount: t.evidenceCount,
          lastPracticedAt: t.lastPracticedAt,
        }))}
        openMisconceptions={openMisconceptions}
        mockScorePct={mockScorePct}
        targetScore={
          typeof prep.target_score === "number" ? prep.target_score : null
        }
        nextHref={nextHref}
        mockNodeHref={
          mockNode && mockNode.status !== "locked"
            ? examPrepNodeHref(prepId, mockNode.id)
            : mockNode
              ? examPrepNodeHref(prepId, mockNode.id)
              : null
        }
      />
    </AstraParitySorShell>
  );
}
