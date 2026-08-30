import { notFound, redirect } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepIntroHref, needsExamIntro } from "@/lib/learning/exam-prep-hrefs";

export const metadata = { title: "Ders" };

export default async function ExamNodePage({
  params,
}: {
  params: Promise<{ prepId: string; nodeId: string }>;
}) {
  const { prepId, nodeId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prep }, { data: node }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title, active_topic_id, intro_completed_at")
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exam_prep_nodes")
      .select("id, kind, status")
      .eq("id", nodeId)
      .eq("exam_prep_id", prepId)
      .maybeSingle(),
  ]);

  if (!prep || !node || node.status === "locked") notFound();

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("status")
    .eq("exam_prep_id", prepId);
  if (needsExamIntro(prep.intro_completed_at, nodeRows ?? [])) {
    redirect(examPrepIntroHref(prepId));
  }

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
      <ExamNodeSession
        prepId={prep.id}
        nodeId={node.id}
        kind={node.kind as PlanNodeKind}
        prepTitle={prep.title ?? "Sınav hazırlığı"}
        topicLabel={topicLabel}
      />
    </AstraParitySorShell>
  );
}
