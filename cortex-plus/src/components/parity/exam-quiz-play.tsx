"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sameOptionSet, selectedOptions, type PublicQuizQuestion } from "@/lib/learning/exam-quiz";

export function ExamQuizPlay({
  questions,
  index,
  value,
  onChange,
  onContinue,
  continueLabel,
  disabled,
  examMode = false,
}: {
  questions: PublicQuizQuestion[];
  index: number;
  value: unknown;
  onChange: (value: string | string[]) => void;
  onContinue: () => void;
  continueLabel: string;
  disabled?: boolean;
  /** Yazılı deneme: cevap sırasında doğru/yanlış ve açıklama yok. */
  examMode?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const question = questions[index];

  useEffect(() => {
    setRevealed(false);
  }, [index]);

  if (!question) return null;

  const selected = selectedOptions(value);
  const isOn = (option: string) => selected.includes(option);
  const hasCorrect = Array.isArray(question.correct) && question.correct.length > 0;
  const isCorrect = hasCorrect ? sameOptionSet(selected, question.correct!) : false;

  function pick(option: string) {
    if (!examMode && revealed) return;
    if (question.multi) {
      onChange(
        isOn(option) ? selected.filter((item) => item !== option) : [...selected, option],
      );
      return;
    }
    onChange(option);
  }

  function handleAction() {
    if (!examMode && hasCorrect && !revealed) {
      setRevealed(true);
      return;
    }
    onContinue();
  }

  const showFeedback = !examMode && revealed && hasCorrect;
  const progress = ((index + (revealed ? 1 : 0)) / Math.max(1, questions.length)) * 100;
  const finishLabel =
    continueLabel.toLocaleLowerCase("tr-TR").includes("bitir") || index + 1 >= questions.length
      ? index + 1 >= questions.length && revealed
        ? "Testi bitir"
        : continueLabel
      : continueLabel;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="px-3 py-1 rounded-full border border-[var(--cp-border)] bg-[var(--cp-surface)] text-xs font-semibold text-[var(--cp-text)]">
          Soru {index + 1} / {questions.length}
        </span>
        {question.multi ? (
          <span className="px-2.5 py-1 rounded-full bg-[rgba(96,165,250,.14)] text-[11px] font-semibold text-[var(--cp-text)]">
            Birden fazla yanıt seçebilirsin
          </span>
        ) : null}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--cp-surface-2)]"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--cp-action,#3d5afe)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h2 className="text-lg sm:text-xl font-semibold text-white leading-relaxed">
        {question.text}
      </h2>

      <div className="space-y-3" role={question.multi ? "group" : "radiogroup"}>
        {question.options.map((option, optionIndex) => {
          const selectedThis = isOn(option);
          const isThisCorrect = hasCorrect && question.correct!.includes(option);
          const missedCorrect = showFeedback && isThisCorrect && !selectedThis && question.multi;
          const showGreen = showFeedback && isThisCorrect && selectedThis;
          const showRed = showFeedback && selectedThis && !isThisCorrect;
          const letter = String.fromCharCode(65 + optionIndex);

          return (
            <button
              key={option}
              type="button"
              disabled={!examMode && revealed}
              onClick={() => pick(option)}
              className={cn(
                "group w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl text-left transition-all duration-150 relative overflow-hidden border",
                showGreen
                  ? "bg-[rgba(34,197,94,.14)] border-[var(--pm-success,#22c55e)] text-emerald-100"
                  : showRed
                    ? "bg-[rgba(239,68,68,.14)] border-[var(--pm-danger,#ef4444)] text-rose-100"
                    : missedCorrect
                      ? "bg-[rgba(245,158,11,.14)] border-[var(--c-warning,#f59e0b)] text-amber-100"
                      : selectedThis
                        ? "bg-[rgba(61,90,254,.16)] border-[var(--cp-action,#3d5afe)] text-white"
                        : "bg-[var(--cp-surface)] hover:bg-[var(--cp-surface-2)] border-[var(--cp-border)] text-zinc-200",
              )}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                  question.multi && !showFeedback ? "rounded-md" : "",
                  showGreen
                    ? "bg-[var(--pm-success,#22c55e)] text-black"
                    : showRed
                      ? "bg-[var(--pm-danger,#ef4444)] text-white"
                      : missedCorrect
                        ? "bg-[var(--c-warning,#f59e0b)] text-black"
                        : selectedThis
                          ? "bg-[var(--cp-action,#3d5afe)] text-white"
                          : "bg-zinc-800/90 text-zinc-400 border border-white/5",
                )}
              >
                {showGreen || missedCorrect ? (
                  <Check className="h-4 w-4 stroke-[3]" aria-label={missedCorrect ? "Kaçırılan doğru" : "Doğru"} />
                ) : showRed ? (
                  <X className="h-4 w-4 stroke-[3]" aria-label="Yanlış" />
                ) : (
                  letter
                )}
              </div>

              <span className="flex-1 text-sm sm:text-base font-normal leading-snug">
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {showFeedback ? (
        <div
          className="p-5 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-surface)] space-y-3"
          aria-live="polite"
        >
          <p className="text-xs font-semibold tracking-wide text-[var(--cp-muted)]">Açıklama</p>
          <div className="flex items-center gap-2 font-semibold text-sm">
            {isCorrect ? (
              <>
                <Check className="h-4 w-4 stroke-[3] text-[var(--pm-success,#22c55e)]" />
                <span>Doğru</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 stroke-[3] text-[var(--pm-danger,#ef4444)]" />
                <span>Yanlış</span>
              </>
            )}
          </div>
          {question.explanation ? (
            <p className="text-sm text-zinc-300 leading-relaxed">{question.explanation}</p>
          ) : null}
          {question.optionWhy?.length ? (
            <ul className="space-y-1.5 text-sm text-zinc-300">
              {question.options.map((option, optionIndex) => {
                if (question.correct?.includes(option)) return null;
                const why = question.optionWhy?.[optionIndex];
                if (!why) return null;
                const letter = String.fromCharCode(65 + optionIndex);
                return (
                  <li key={option}>
                    <span className="text-zinc-100">
                      {letter} · {option}:
                    </span>{" "}
                    {why}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled || selected.length === 0}
        onClick={handleAction}
        className="cp-exam-continue cp-exam-continue--primary w-full inline-flex items-center justify-center gap-2 min-h-11"
      >
        <span>
          {!examMode && hasCorrect && !revealed
            ? "Kontrol et"
            : revealed && index + 1 >= questions.length
              ? "Testi bitir"
              : revealed
                ? "Devam et"
                : finishLabel}
        </span>
      </button>
    </div>
  );
}

/** Quiz sonuç özeti — soru bazında inceleme ve zayıf konular. */
export function ExamQuizResults({
  score,
  total,
  secondsSpent,
  reviews,
  weakTopics,
  onReview,
  nextHref,
  lessonHref,
}: {
  score: number;
  total: number;
  secondsSpent: number;
  reviews: { text: string; correct: boolean; explanation?: string | null }[];
  weakTopics: string[];
  onReview?: (index: number) => void;
  nextHref: string;
  lessonHref?: string | null;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const tone =
    pct >= 70 ? "text-[var(--pm-success,#22c55e)]" : pct >= 40 ? "text-[var(--c-warning,#f59e0b)]" : "text-[var(--pm-danger,#ef4444)]";
  const message =
    pct >= 85 ? "🥳 Harika iş çıkardın!" : pct >= 60 ? "👏 Güzel gidiyor" : "💪 Biraz daha gelişebilirsin";
  const minutes = Math.max(1, Math.round(secondsSpent / 60));

  return (
    <section className="space-y-6">
      <p className="text-sm text-[var(--cp-muted)]">Doğru cevaplar</p>
      <p className={cn("text-5xl font-extrabold", tone)}>
        {score}/{total}
      </p>
      <p className="text-lg">{message}</p>
      <p className="text-sm text-[var(--cp-muted)]">
        Doğruluk %{pct} · Harcanan zaman {minutes} dk
      </p>
      {reviews.length ? (
        <div>
          <h2 className="text-base font-semibold mb-2">Soru soru inceleme</h2>
          <ul className="space-y-2">
            {reviews.map((item, i) => (
              <li key={`${item.text}-${i}`}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-surface)] px-4 py-3 text-left text-sm"
                  onClick={() => onReview?.(i)}
                >
                  <span className="line-clamp-2">{item.text.slice(0, 80)}</span>
                  {item.correct ? (
                    <Check className="h-4 w-4 text-[var(--pm-success,#22c55e)]" aria-label="Doğru" />
                  ) : (
                    <X className="h-4 w-4 text-[var(--pm-danger,#ef4444)]" aria-label="Yanlış" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {weakTopics.length ? (
        <div className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-surface)] p-4 space-y-2">
          <h2 className="text-base font-semibold">Zayıf konular</h2>
          <div className="flex flex-wrap gap-2">
            {weakTopics.slice(0, 3).map((topic) => (
              <span key={topic} className="pm-chip text-xs">
                {topic}
              </span>
            ))}
          </div>
          {lessonHref ? (
            <a href={lessonHref} className="text-sm text-[var(--cp-muted)] underline">
              Bu konularda odaklı pratik
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {lessonHref ? (
          <a href={lessonHref} className="cp-exam-continue text-center">
            Dersi tekrarla
          </a>
        ) : null}
        <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary text-center">
          Devam et
        </a>
      </div>
    </section>
  );
}
