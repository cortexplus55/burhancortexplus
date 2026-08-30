import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamQuestionReviewClient } from "@/components/parity/exam-question-review-client";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Soru İnceleme · Astra AI" };

export default async function ExamQuestionReviewPage({
  params,
}: {
  params: Promise<{ prepId: string; examId: string }>;
}) {
  const { prepId, examId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: exam } = await supabase
    .from("practice_exams")
    .select("id, title, exam_prep_id")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exam || exam.exam_prep_id !== prepId) notFound();

  const { data: attempt } = await supabase
    .from("practice_exam_attempts")
    .select("id, score")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: questions }, { data: reviews }] = await Promise.all([
    supabase
      .from("practice_exam_questions")
      .select("id, question_text, options, correct_answer, sort_order")
      .eq("exam_id", examId)
      .order("sort_order"),
    attempt
      ? supabase
          .from("practice_exam_item_reviews")
          .select("id, question_id, user_answer, is_correct, explanation, liked")
          .eq("attempt_id", attempt.id)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const mappedQuestions = (questions ?? []).map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    options: (q.options as string[]) ?? [],
    correct_answer: q.correct_answer as string | null,
    sort_order: (q.sort_order as number) ?? 0,
  }));

  const mappedReviews = (reviews ?? []).map((r) => ({
    id: r.id as string,
    question_id: r.question_id as string,
    user_answer: r.user_answer as string | null,
    is_correct: Boolean(r.is_correct),
    explanation: r.explanation as string | null,
    liked: Boolean(r.liked),
  }));

  return (
    <AstraParitySorShell {...shell}>
      <ExamQuestionReviewClient
        prepId={prepId}
        examId={examId}
        examTitle={exam.title ?? "Deneme Sınavı"}
        score={attempt?.score != null ? Number(attempt.score) : null}
        questions={mappedQuestions}
        reviews={mappedReviews}
      />
    </AstraParitySorShell>
  );
}
