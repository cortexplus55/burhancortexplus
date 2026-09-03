import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepHome } from "@/components/parity/exam-prep-home";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { ensurePrepNodes } from "@/lib/learning/exam-prep-insert";
import { daysUntilExam, nodeProgress, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  examPrepTopicHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";

export const metadata = { title: "Sınav hazırlığı" };

export default async function ExamPrepDetailPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, study_plan_id, exam_date, active_topic_id, intro_completed_at")
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
    .select("id, kind, title, day_index, sort_order, status")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const nodes = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    title: row.title as string,
    dayIndex: row.day_index as number,
    sortOrder: row.sort_order as number,
    status: row.status as "locked" | "ready" | "done",
  }));

  const progress = nodeProgress(nodes);
  const ready = nodes.find((node) => node.status === "ready");
  const hasTopic = Boolean(prep.active_topic_id);
  const needsIntro = hasTopic && needsExamIntro(prep.intro_completed_at, nodes);
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
        startHref={startHref}
        canShare={Boolean(profile?.school_id)}
        initialShared={shareRow?.visibility === "school"}
      />
    </AstraParitySorShell>
  );
}
