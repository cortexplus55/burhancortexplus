import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamTopicPick } from "@/components/parity/exam-topic-pick";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";

export const metadata = { title: "Konu seç" };

export default async function ExamTopicPickPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, study_plan_id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const topics = await loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id);

  return (
    <AstraParitySorShell {...shell}>
      <ExamTopicPick
        prepId={prep.id}
        topics={topics.map((topic) => ({ id: topic.id, label: topic.label }))}
      />
    </AstraParitySorShell>
  );
}
