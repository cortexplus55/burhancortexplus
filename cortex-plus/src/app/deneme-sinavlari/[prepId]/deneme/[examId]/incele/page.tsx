import Link from "next/link";
import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { parseExamAnalysis } from "@/lib/learning/exam-analysis";
import { ExamQuestionReviewClient } from "@/components/parity/exam-question-review-client";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { mockElapsedLabel } from "@/lib/learning/mock-exam/time-limit";
import { scoringKeyTerms } from "@/lib/learning/mock-exam/key-terms";
import { rowVerdictCounts } from "@/lib/learning/mock-exam/verdict-counts";

export const metadata = { title: "Soru inceleme" };

/** Açık uçlu notun ölçütleri (grade-exam: met / missed) ve puan notu (`step`). Eski kayıtta yok. */
function reviewFeedback(raw: unknown): { met: string[]; missed: string[]; note?: string } | null {
  const row = raw && typeof raw === "object" ? (raw as { met?: unknown; missed?: unknown; step?: unknown }) : null;
  if (!row) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []);
  const met = list(row.met);
  const missed = list(row.missed);
  const note = typeof row.step === "string" && row.step.trim() ? row.step.trim() : undefined;
  return met.length || missed.length || note ? { met, missed, ...(note ? { note } : {}) } : null;
}

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
    .select("id, title, exam_prep_id, started_at")
    .eq("id", examId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exam || exam.exam_prep_id !== prepId) notFound();

  const { data: attempt } = await supabase
    .from("practice_exam_attempts")
    .select("id, score, analysis, completed_at, duration_seconds")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    // Yalnız notlanmış kayıt (22 Ekim 2026 inceleme): notlandıktan sonra kaydedilen taslak satırı en yeni
    // kayıt oluyor, inceleme puansız açılıyordu.
    .not("completed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Analiz sınav biterken zaten üretilip kaydediliyordu ama hiçbir yerde
  // gösterilmiyordu: öğrenci yalnızca doğru/yanlış listesini görüyordu.
  const analysis = parseExamAnalysis(attempt?.analysis as string | null);

  const [{ data: questions }, { data: reviews }] = await Promise.all([
    supabase
      .from("practice_exam_questions")
      .select("id, question_text, question_type, options, correct_answer, correct_answers, sort_order, rubric, model_answer")
      .eq("exam_id", examId)
      .order("sort_order"),
    attempt
      ? supabase
          .from("practice_exam_item_reviews")
          .select("id, question_id, user_answer, is_correct, explanation, liked, verdict, points_earned, points_max, feedback")
          .eq("attempt_id", attempt.id)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const mappedQuestions = (questions ?? []).map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    options: (q.options as string[]) ?? [],
    correct_answer: q.correct_answer as string | null,
    // Çok cevaplı soruda bütün doğrular (Paket A): eski sütun yalnız ilk doğruyu tutuyor.
    correct_answers: Array.isArray(q.correct_answers)
      ? (q.correct_answers as unknown[]).filter((item): item is string => typeof item === "string")
      : null,
    question_type: (q.question_type as string | null) ?? null,
    sort_order: (q.sort_order as number) ?? 0,
    // Açık uçlu soruda puan getiren kilit terimler ve birimler (31 Ekim 2026, Paket J3 #11).
    key_terms: ((q.options as string[] | null) ?? []).length
      ? []
      : scoringKeyTerms({
          rubric: (Array.isArray(q.rubric) ? (q.rubric as Array<{ criterion?: string } | string>) : []).map((item) =>
            typeof item === "string" ? item : String(item?.criterion ?? ""),
          ),
          modelAnswer: (q.model_answer as string | null) ?? null,
          questionText: q.question_text as string,
        }),
  }));

  const mappedReviews = (reviews ?? []).map((r) => ({
    id: r.id as string,
    question_id: r.question_id as string,
    user_answer: r.user_answer as string | null,
    is_correct: Boolean(r.is_correct),
    explanation: r.explanation as string | null,
    liked: Boolean(r.liked),
    verdict: (r.verdict as string | null) ?? null,
    points_earned: r.points_earned != null ? Number(r.points_earned) : null,
    points_max: r.points_max != null ? Number(r.points_max) : null,
    feedback: reviewFeedback(r.feedback),
  }));

  // Deftere düşen sorular doğru olmayanlardır; ama "yanlış" diye sayılmaz (30 Ekim 2026, canlı tur: 1 yanlış + 6 boş
  // "7 yanlışın" diye yazıyordu). Sayım sonuç sayfasıyla aynı işlevden.
  const counts = rowVerdictCounts(mappedReviews);
  const wrongCount = counts.wrong + counts.blank + counts.partial;
  const notebookParts = [
    counts.wrong ? `${counts.wrong} yanlış` : "",
    counts.blank ? `${counts.blank} boş` : "",
    counts.partial ? `${counts.partial} kısmen` : "",
  ].filter(Boolean);
  const elapsed = attempt
    ? mockElapsedLabel(
        exam.started_at as string | null,
        attempt.completed_at as string | null,
        (attempt.duration_seconds as number | null) ?? null,
      )
    : "—";

  return (
    <ParitySorShell {...shell}>
      {analysis.summary ? (
        <section className="mb-6 rounded-2xl border border-white/10 p-5">
          <h2 className="text-base font-semibold text-[var(--cs-text)]">
            Bu sınav sana ne söylüyor
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--cs-muted)]">
            {analysis.summary}
          </p>

          {analysis.weakTopics.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cs-muted)]">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cs-muted)]">
                Sırada ne yapmalısın
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-[var(--cs-muted)]">
                {analysis.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {wrongCount > 0 ? (
            <Link
              href="/yanlislarim"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-bold text-action-foreground transition-colors hover:bg-action-hover"
            >
              {wrongCount} soru tekrar defterine düştü ({notebookParts.join(", ")}) — tekrar et
            </Link>
          ) : null}
        </section>
      ) : null}

      {elapsed !== "—" ? (
        <p className="mb-4 text-sm text-[var(--cs-muted)]">
          Çözüm süresi: <span className="font-semibold tabular-nums text-[var(--cs-text)]">{elapsed}</span>
        </p>
      ) : null}

      <ExamQuestionReviewClient
        prepId={prepId}
        examId={examId}
        examTitle={exam.title ?? "Deneme Sınavı"}
        score={attempt?.score != null ? Number(attempt.score) : null}
        questions={mappedQuestions}
        reviews={mappedReviews}
      />
    </ParitySorShell>
  );
}
