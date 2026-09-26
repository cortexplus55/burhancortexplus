"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { MistakeQuestion } from "@/lib/learning/mistake-notebook";
import { MASTERY_STREAK } from "@/lib/learning/mistake-notebook-rule";

export type RunnerFeedback = {
  correct: boolean;
  mastered: boolean;
  correctAnswer: string | null;
  explanation: string | null;
  firstWrongAnswer?: string | null;
  /** Yanıttan sonraki seri — "1/2, bir doğru daha" mesajı için. */
  correctStreak?: number;
};

const SOURCE_LABEL: Record<MistakeQuestion["source"], string> = {
  quiz: "Quiz",
  deneme: "Deneme",
};

/** "1/2" — defterden çıkmaya kaç doğru kaldığını tek bakışta gösterir. */
export function streakLabel(correctStreak: number): string {
  return `${Math.min(correctStreak, MASTERY_STREAK)}/${MASTERY_STREAK}`;
}

export function MistakeRunner({
  question,
  position,
  total,
  drillId,
  onAnswered,
  onNext,
  nextLabel,
}: {
  question: MistakeQuestion;
  position: number;
  total: number;
  drillId?: string;
  onAnswered?: (feedback: RunnerFeedback) => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RunnerFeedback | null>(null);
  const [sending, setSending] = useState(false);

  const topic = question.topicLabel?.trim();
  const topicHref = topic
    ? `/studio/anlat?topic=${encodeURIComponent(topic)}`
    : "/studio/anlat";
  const similarHref = topic
    ? `/studio/quiz?topic=${encodeURIComponent(topic)}`
    : "/studio/quiz";

  async function check() {
    if (picked === null || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/learning/mistakes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: question.id,
          answer: picked,
          ...(drillId ? { drillId, drillTotal: total } : {}),
        }),
      });
      if (!res.ok) {
        setFeedback({
          correct: false,
          mastered: false,
          correctAnswer: null,
          explanation:
            "Yanıtın kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
          firstWrongAnswer: null,
        });
        return;
      }
      const data = (await res.json()) as RunnerFeedback;
      setFeedback(data);
      onAnswered?.(data);
    } finally {
      setSending(false);
    }
  }

  function advance() {
    setPicked(null);
    setFeedback(null);
    onNext();
  }

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--cs-muted)]">
        <span>
          {position} / {total}
        </span>
        <span aria-hidden>·</span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide">
          {SOURCE_LABEL[question.source]}
        </span>
        <span aria-hidden>·</span>
        <span title="Defterden çıkmak için üst üste iki doğru gerekir">
          Tekrar {streakLabel(question.correctStreak)}
        </span>
        {question.wrongCount > 1 ? (
          <>
            <span aria-hidden>·</span>
            <span>{question.wrongCount} kez yanlış</span>
          </>
        ) : null}
      </p>

      <div className="cs-pay-card p-5">
        <p className="text-base leading-relaxed text-[var(--cs-text)]">
          {question.questionText}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {question.options.map((option) => {
            const isPicked = picked === option;
            const isAnswer =
              feedback?.correctAnswer != null &&
              feedback.correctAnswer === option;
            return (
              <button
                key={option}
                type="button"
                disabled={Boolean(feedback)}
                onClick={() => setPicked(option)}
                aria-pressed={isPicked}
                className={[
                  "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  isAnswer
                    ? "border-emerald-500/60 bg-emerald-500/10 text-[var(--cs-text)]"
                    : isPicked && feedback && !feedback.correct
                      ? "border-red-500/60 bg-red-500/10 text-[var(--cs-text)]"
                      : isPicked
                        ? "border-amber-500 bg-amber-500/10 text-[var(--cs-text)]"
                        : "border-white/10 text-[var(--cs-muted)] hover:border-white/25",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>

        {!feedback ? (
          <button
            type="button"
            onClick={check}
            disabled={picked === null || sending}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Kontrol ediliyor…" : "Kontrol et"}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <p
              className={[
                "inline-flex items-center gap-2 text-sm font-semibold",
                feedback.correct ? "text-emerald-400" : "text-red-400",
              ].join(" ")}
            >
              {feedback.correct ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <X className="h-4 w-4" aria-hidden="true" />
              )}
              {feedback.correct ? "Doğru" : "Yanlış"}
              {feedback.mastered ? " · bu soru defterden çıktı" : ""}
            </p>

            {!feedback.mastered ? (
              <p className="text-xs text-[var(--cs-muted)]">
                {feedback.correct
                  ? `Tekrar ${streakLabel(feedback.correctStreak ?? 1)} — bir doğru daha yaparsan defterden çıkar.`
                  : `Seri sıfırlandı (${streakLabel(0)}). Üst üste iki doğru gerekiyor.`}
              </p>
            ) : null}

            {!feedback.correct && feedback.firstWrongAnswer ? (
              <p className="text-sm text-[var(--cs-muted)]">
                İlk seçimin:{" "}
                <span className="text-[var(--cs-text)]">
                  {feedback.firstWrongAnswer}
                </span>
              </p>
            ) : null}

            {feedback.correctAnswer ? (
              <p className="text-sm text-[var(--cs-muted)]">
                Doğru mantık:{" "}
                <span className="font-medium text-[var(--cs-text)]">
                  {feedback.correctAnswer}
                </span>
              </p>
            ) : null}

            {feedback.explanation ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cs-muted)]">
                  Neden?
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--cs-text)]">
                  {feedback.explanation}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Link
                href={similarHref}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
              >
                Benzer soru çöz
              </Link>
              <Link
                href={topicHref}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[var(--cs-muted)]"
              >
                Konuya dön
              </Link>
            </div>

            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              {nextLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
