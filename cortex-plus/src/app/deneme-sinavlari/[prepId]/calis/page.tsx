import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepStudySession } from "@/components/parity/exam-prep-study-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { nextOpenTopic } from "@/lib/learning/exam-prep-progress";
import { loadOrBackfillTopics, mapLessonsByTopic } from "@/lib/learning/exam-prep-topics";

export const metadata = { title: "Ders oturumu" };
export const dynamic = "force-dynamic";

export default async function ExamPrepCalisPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, study_plan_id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prep) notFound();

  const topics = await loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id);
  const activeTopic =
    topics.find((topic) => topic.id === query.topic) ?? nextOpenTopic(topics) ?? topics[0] ?? null;

  const { data: lessonRows } = topics.length
    ? await supabase
        .from("exam_prep_lessons")
        .select("id, title, content_md, topic_id")
        .eq("exam_prep_id", prepId)
    : { data: [] as { id: string; title: string; content_md: string | null; topic_id: string | null }[] };

  const lessonsByTopic = mapLessonsByTopic(lessonRows ?? [], topics);

  return (
    <AstraParitySorShell {...shell}>
      <Suspense fallback={<div className="ap-exam-page ap-exam-page--loading" />}>
        <ExamPrepStudySession
          prepId={prep.id}
          prepTitle={prep.title ?? "Sınav hazırlığı"}
          topics={topics}
          initialTopicId={activeTopic?.id ?? null}
          lessonsByTopic={lessonsByTopic}
        />
      </Suspense>
    </AstraParitySorShell>
  );
}
