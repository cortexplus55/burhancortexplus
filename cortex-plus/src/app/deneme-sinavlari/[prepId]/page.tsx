import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepHome } from "@/components/parity/exam-prep-home";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { ensurePrepNodes } from "@/lib/learning/exam-prep-insert";
import {
  daysUntilExam,
  nodeProgress,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  examPrepTopicHref,
  examIntroPending,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import {
  buildLearningIndicators,
  preferNextNodeForTracking,
  weakOrStaleTopicKeys,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";

export const metadata = { title: "Sınav hazırlığı" };
export const dynamic = "force-dynamic";

export default async function ExamPrepDetailPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();
  const trackingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select(
      "id, title, exam_type, study_plan_id, exam_date, active_topic_id, intro_completed_at, intro_deferred_at, schedule_v2, learning_tracking, target_score, daily_minutes, study_days, hard_topics_self, learning_preferences",
    )
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prep) notFound();

  // Paylaşım kolonları migration ile geliyor; yoksa düğme gizli kalır.
  const [{ data: profile }, { data: shareRow }] = await Promise.all([
    supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle(),
    supabase.from("exam_preps").select("visibility").eq("id", prepId).maybeSingle(),
  ]);

  await loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id);
  await ensurePrepNodes(supabase, prep);

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
        ? (row.session_meta as {
            objective?: string;
            sourcePages?: number[];
            durationMinutes?: number;
            role?: string;
            calendarDate?: string;
            topicTitle?: string;
          })
        : null,
  }));

  const progress = nodeProgress(nodes);
  let ready = nodes.find((node) => node.status === "ready");
  const hasTopic = Boolean(prep.active_topic_id);
  const needsIntro = hasTopic && needsExamIntro(prep.intro_completed_at, nodes, prep.intro_deferred_at);

  let learningTrackingView = null as null | {
    programProgressPct: number;
    programLabel: string;
    topicMasteryPct: number | null;
    topicMasteryLabel: string;
    measuredTopicCount: number;
    unmeasuredTopicCount: number;
    examReadinessPct: number;
    examReadinessLabel: string;
    claimFullyReady: boolean;
  };

  let openMisconceptions = 0;

  if (trackingV2) {
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

    openMisconceptions = misconceptionCount ?? 0;

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

    const mockNode = nodes.find((n) => n.kind === "written_exam" && n.status === "done");
    let mockScorePct: number | null = null;
    if (mockNode) {
      const { data: mockAttempt } = await supabase
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
      topics,
      plannedTopicKeys,
      mockScorePct,
      targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
      openMisconceptions,
    });

    learningTrackingView = {
      programProgressPct: indicators.programProgress.pct,
      programLabel: indicators.programProgress.label,
      topicMasteryPct: indicators.topicMastery.pct,
      topicMasteryLabel: indicators.topicMastery.label,
      measuredTopicCount: indicators.topicMastery.measuredCount,
      unmeasuredTopicCount: indicators.topicMastery.unmeasuredCount,
      examReadinessPct: indicators.examReadiness.pct,
      examReadinessLabel: indicators.examReadiness.label,
      claimFullyReady: indicators.examReadiness.claimFullyReady,
    };

    const biased = preferNextNodeForTracking(nodes, {
      openMisconceptions,
      weakOrStaleTopicKeys: weakOrStaleTopicKeys(topics),
    });
    if (biased) ready = biased;
  }

  const startHref = !hasTopic
    ? examPrepTopicHref(prepId)
    : needsIntro
      ? examPrepIntroHref(prepId)
      : ready
        ? examPrepNodeHref(prepId, ready.id)
        : examPrepHomeHref(prepId);

  let topicLabel: string | null = null;
  if (prep.active_topic_id) {
    const { data: topic } = await supabase
      .from("exam_prep_topics")
      .select("label")
      .eq("id", prep.active_topic_id)
      .maybeSingle();
    topicLabel = topic?.label ?? null;
  }

  const scheduleV2 =
    prep.schedule_v2 && typeof prep.schedule_v2 === "object"
      ? (prep.schedule_v2 as {
          summary?: string;
          fits?: boolean;
          optionsIfTight?: string[];
        })
      : null;

  const { data: allTopics } = trackingV2
    ? await supabase
        .from("exam_prep_topics")
        .select("label")
        .eq("exam_prep_id", prepId)
    : { data: [] as { label: string }[] };

  const settings = trackingV2
    ? {
        examDate: (prep.exam_date as string | null) ?? null,
        dailyMinutes:
          typeof prep.daily_minutes === "number" ? prep.daily_minutes : 45,
        studyDays:
          Array.isArray(prep.study_days) && prep.study_days.length
            ? (prep.study_days as number[])
            : [1, 2, 3, 4, 5],
        hardTopics: Array.isArray(prep.hard_topics_self)
          ? (prep.hard_topics_self as string[])
          : [],
        topicOptions: (allTopics ?? [])
          .map((t) => String(t.label ?? "").trim())
          .filter(Boolean),
        preferences: parseLearningPreferences(prep.learning_preferences),
        scheduleFits:
          typeof scheduleV2?.fits === "boolean" ? scheduleV2.fits : null,
        optionsIfTight: Array.isArray(scheduleV2?.optionsIfTight)
          ? scheduleV2!.optionsIfTight!
          : [],
      }
    : null;

  return (
    <AstraParitySorShell {...shell}>
      <ExamPrepHome
        prepId={prep.id}
        title={prep.title ?? prep.exam_type}
        examType={prep.exam_type}
        examDate={prep.exam_date}
        daysLabel={prep.exam_date ? `${daysUntilExam(prep.exam_date)} gün kaldı` : ""}
        progressPct={progress.pct}
        nodes={nodes}
        hasTopic={hasTopic}
        activeTopicLabel={topicLabel}
        needsIntro={needsIntro}
        introPending={examIntroPending(prep.intro_completed_at, prep.intro_deferred_at)}
        startHref={startHref}
        canShare={Boolean(profile?.school_id)}
        initialShared={shareRow?.visibility === "school"}
        scheduleSummary={scheduleV2?.summary ?? null}
        learningTracking={learningTrackingView}
        uiV2={trackingV2}
        openMisconceptions={openMisconceptions}
        settings={settings}
      />
    </AstraParitySorShell>
  );
}
