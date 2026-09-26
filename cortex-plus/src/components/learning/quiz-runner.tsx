"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Kütüphanedeki hazır quiz.
 *
 * Doğru şık istemciye gitmiyor: yanıtlar `POST /api/learning/quiz/grade`
 * ile sunucuda notlanıyor, yanlışlar deftere düşüyor ve streak gerçek
 * çalışmayla artıyor. Eski hâli doğru şıkkı HTML'e basıp tarayıcıda
 * karşılaştırıyordu — hem kopya çekilebiliyordu hem de deftere hiçbir şey
 * yazılmıyordu.
 */
type Question = { id: string; text: string; options: string[] };

type GradedItem = {
  questionId: string;
  status: "correct" | "incorrect" | "blank";
  correctAnswer: string | null;
  explanation: string | null;
};

type GradeResult = {
  score: number;
  correct: number;
  incorrect: number;
  blank: number;
  total: number;
  mistakesRecorded: number;
  items: GradedItem[];
};

export function QuizRunner({
  quizId,
  title,
  questions,
}: {
  quizId: string;
  title: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!questions.length) return null;

  const answeredCount = Object.keys(answers).length;
  const submitted = result !== null;
  const itemById = new Map(result?.items.map((i) => [i.questionId, i]) ?? []);

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/learning/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId,
          topic: title,
          answers: Object.entries(answers).map(([questionId, selected]) => ({
            questionId,
            selected,
          })),
        }),
      });
      if (!res.ok) {
        setError("Sonuç kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
        return;
      }
      setResult((await res.json()) as GradeResult);
    } catch {
      setError("Sonuç kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cs-pay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--cs-text)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--cs-muted)]">
            {result
              ? `${result.correct} / ${result.total} doğru`
              : `${answeredCount} / ${questions.length} cevaplandı`}
          </p>
        </div>
        {result ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
              result.correct === result.total
                ? "bg-action/20 text-amber-200"
                : "bg-white/10 text-[var(--cs-muted)]",
            )}
          >
            {result.correct === result.total ? "Mükemmel" : `%${result.score}`}
          </span>
        ) : null}
      </div>

      {!submitted && answeredCount > 0 ? (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={questions.length}
        >
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-out"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      ) : null}

      <ol className="mt-4 space-y-5">
        {questions.map((question, index) => {
          const graded = itemById.get(question.id);
          return (
            <li key={question.id}>
              <fieldset>
                <legend className="text-sm font-medium text-[var(--cs-text)]">
                  {index + 1}. {question.text}
                </legend>
                <div className="mt-2 space-y-2">
                  {question.options.map((option) => {
                    const selected = answers[question.id] === option;
                    const isCorrectOption =
                      graded?.correctAnswer != null && graded.correctAnswer === option;
                    const isCorrect = submitted && isCorrectOption;
                    const isWrong = submitted && selected && !isCorrectOption;

                    return (
                      <label
                        key={option}
                        className={cn(
                          "cs-quiz-option flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--cs-text)]",
                          !submitted && selected && "cs-quiz-option--selected",
                          isCorrect && "cs-quiz-option--correct",
                          isWrong && "cs-quiz-option--wrong",
                          submitted && "cursor-default",
                        )}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={selected}
                          disabled={submitted}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [question.id]: option }))
                          }
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--cs-border)]",
                            selected && !submitted && "border-[var(--cs-primary)]",
                          )}
                          aria-hidden
                        >
                          {submitted && isCorrect ? (
                            <Check className="h-3 w-3 text-amber-300" />
                          ) : null}
                          {submitted && isWrong ? (
                            <X className="h-3 w-3 text-red-400" />
                          ) : null}
                        </span>
                        <span className="flex-1">{option}</span>
                        {submitted && isCorrect && !selected ? (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-amber-300/90">
                            Doğru
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {graded && graded.status !== "correct" && graded.explanation ? (
                  <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-[var(--cs-muted)]">
                    <span className="font-semibold text-[var(--cs-text)]">Neden? </span>
                    {graded.explanation}
                  </p>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ol>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!submitted ? (
          <button
            type="button"
            disabled={answeredCount !== questions.length || sending}
            onClick={() => void submit()}
            className="cs-btn-primary h-9 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Kontrol ediliyor…" : "Kontrol et"}
          </button>
        ) : (
          <>
            {result && result.incorrect > 0 ? (
              <Link
                href="/yanlislarim"
                className="cs-btn-primary inline-flex h-9 items-center rounded-full px-5 text-sm font-semibold"
              >
                Yanlışlarımı tekrar et
              </Link>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[var(--cs-border)] bg-transparent text-[var(--cs-text)] hover:bg-white/5"
              onClick={() => {
                setAnswers({});
                setResult(null);
              }}
            >
              Tekrar dene
            </Button>
            {result && result.mistakesRecorded > 0 ? (
              <span className="text-xs text-[var(--cs-muted)]">
                {result.mistakesRecorded} yanlış deftere yazıldı.
              </span>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
