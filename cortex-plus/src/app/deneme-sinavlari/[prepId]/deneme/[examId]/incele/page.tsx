import Link from "next/link";
import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { parseExamAnalysis } from "@/lib/learning/exam-analysis";
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
    .select("id, score, analysis")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Analiz sınav biterken zaten üretilip kaydediliyordu ama hiçbir yerde
  // gösterilmiyordu: öğrenci yalnızca doğru/yanlış listesini görüyordu.
  const analysis = parseExamAnalysis(attempt?.analysis as string | null);

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

  const wrongCount = mappedReviews.filter((r) => !r.is_correct).length;

  return (
    <AstraParitySorShell {...shell}>
      {analysis.summary ? (
        <section className="mb-6 rounded-2xl border border-white/10 p-5">
          <h2 className="text-base font-semibold text-[var(--astra-text)]">
            Bu sınav sana ne söylüyor
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--astra-muted)]">
            {analysis.summary}
          </p>

          {analysis.weakTopics.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--astra-muted)]">
                Puanı burada kaybettin
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {analysis.weakTopics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.nextSteps.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--astra-muted)]">
                Sırada ne yapmalısın
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-[var(--astra-muted)]">
                {analysis.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {wrongCount > 0 ? (
            <Link
              href="/yanlislarim"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              {wrongCount} yanlışın deftere düştü — tekrar et
            </Link>
          ) : null}
        </section>
      ) : null}

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
