import { notFound, redirect } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamIntroQuiz } from "@/components/parity/exam-intro-quiz";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  examPrepHomeHref,
  examPrepNodeHref,
  examPrepTopicHref,
  needsExamIntro,
} from "@/lib/learning/exam-prep-hrefs";

export const metadata = { title: "Tanışma testi" };

export default async function ExamIntroPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, active_topic_id, intro_completed_at")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();
  if (!prep.active_topic_id) redirect(examPrepTopicHref(prepId));

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("id, status")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  if (!needsExamIntro(prep.intro_completed_at, nodeRows ?? [])) {
    const ready = (nodeRows ?? []).find((row) => row.status === "ready");
    redirect(ready ? examPrepNodeHref(prepId, ready.id) : examPrepHomeHref(prepId));
  }

  const { data: topic } = await supabase
    .from("exam_prep_topics")
    .select("label")
    .eq("id", prep.active_topic_id)
    .maybeSingle();

  return (
    <AstraParitySorShell {...shell}>
      <ExamIntroQuiz prepId={prep.id} topicLabel={topic?.label ?? "Konu"} />
    </AstraParitySorShell>
  );
}
