"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Question = { id: string; text: string; options: string[]; correct: string };

export function QuizRunner({
  title,
  questions,
}: {
  title: string;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions.length) return null;

  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correct).length;

  return (
    <section className="astra-pay-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--astra-text)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--astra-muted)]">
            {submitted
              ? `${correctCount} / ${questions.length} doğru`
              : `${answeredCount} / ${questions.length} cevaplandı`}
          </p>
        </div>
        {submitted ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
              correctCount === questions.length
                ? "bg-amber-500/20 text-amber-200"
                : "bg-white/10 text-[var(--astra-muted)]",
            )}
          >
            {correctCount === questions.length ? "Mükemmel" : "Sonuç"}
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
        {questions.map((question, index) => (
          <li key={question.id}>
            <fieldset>
              <legend className="text-sm font-medium text-[var(--astra-text)]">
                {index + 1}. {question.text}
              </legend>
              <div className="mt-2 space-y-2">
                {question.options.map((option) => {
                  const selected = answers[question.id] === option;
                  const isCorrectOption = option === question.correct;
                  const isCorrect = submitted && isCorrectOption;
                  const isWrong = submitted && selected && !isCorrectOption;

                  return (
                    <label
                      key={option}
                      className={cn(
                        "astra-quiz-option flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--astra-text)]",
                        !submitted && selected && "astra-quiz-option--selected",
                        isCorrect && "astra-quiz-option--correct",
                        isWrong && "astra-quiz-option--wrong",
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
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--astra-border)]",
                          selected && !submitted && "border-[var(--astra-primary)]",
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
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {!submitted ? (
          <button
            type="button"
            disabled={answeredCount !== questions.length}
            onClick={() => setSubmitted(true)}
            className="astra-btn-primary h-9 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Kontrol et
          </button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[var(--astra-border)] bg-transparent text-[var(--astra-text)] hover:bg-white/5"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            Tekrar dene
          </Button>
        )}
      </div>
    </section>
  );
}
