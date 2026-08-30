import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewTools } from "@/components/parity/review-tools";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { cn } from "@/lib/utils";

export const metadata = { title: "Soru inceleme" };

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

  const reviewByQuestion = new Map(
    (reviews ?? []).map((row) => [row.question_id as string, row]),
  );

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page ap-exam-review">
        <Link
          href={`/deneme-sinavlari/${prepId}/sonuc?examId=${examId}${
            attempt?.score != null ? `&score=${attempt.score}` : ""
          }`}
          className="ap-back-pill"
        >
          ← Sonuca dön
        </Link>
        <div className="ap-exam-result-divider" aria-hidden />
        <h1>Soru soru incele</h1>
        <p className="text-sm text-[var(--ap-muted)]">{exam.title}</p>

        <ol className="ap-exam-review-list">
          {(questions ?? []).map((question, index) => {
            const review = reviewByQuestion.get(question.id as string);
            const options = (question.options as string[]) ?? [];
            const explanation =
              review?.explanation ||
              `Doğru yanıt: ${question.correct_answer ?? "—"}`;
            const speakText = `${question.question_text}. ${explanation}`;
            return (
              <li key={question.id} className="ap-exam-review-card">
                <p className="ap-exam-review-index">Soru {index + 1}</p>
                <p className="ap-exam-runner-q">{question.question_text}</p>
                <ul className="ap-exam-options">
                  {options.map((option) => {
                    const isCorrect = option === question.correct_answer;
                    const isPicked = option === review?.user_answer;
                    return (
                      <li
                        key={option}
                        className={cn(
                          "ap-exam-option",
                          isCorrect && "ap-exam-option--correct",
                          isPicked && !isCorrect && "ap-exam-option--wrong",
                        )}
                      >
                        <span>{option}</span>
                        {isCorrect ? <em>Doğru</em> : null}
                        {isPicked && !isCorrect ? <em>Senin yanıtın</em> : null}
                      </li>
                    );
                  })}
                </ul>
                <p
                  className={cn(
                    "ap-exam-review-verdict",
                    review?.is_correct
                      ? "ap-exam-review-verdict--ok"
                      : "ap-exam-review-verdict--bad",
                  )}
                >
                  {review?.is_correct ? "Doğru" : "Yanlış"}
                </p>
                <p className="ap-exam-review-explain">{explanation}</p>
                {review ? (
                  <ReviewTools
                    text={speakText}
                    initialLiked={Boolean(review.liked)}
                    likeHref="/api/learning/exam/review-like"
                    likeBody={{ reviewId: review.id }}
                    copyLabel="Açıklama kopyalandı."
                    ariaLabel={`Soru ${index + 1} araçları`}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </AstraParitySorShell>
  );
}
