"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { MistakeQuestion } from "@/lib/learning/mistake-notebook";

/**
 * Bir soruyu sorup yanıtı sunucuya doğrulatan ekran.
 *
 * Hem yanlış defteri hem günün turu bunu kullanıyor. İki yerde ayrı yazılsaydı
 * biri düzeltilip diğeri unutulurdu — özellikle "doğru yanıt istemcide yok"
 * kuralı, ki o bu ekranın var oluş biçimini belirliyor: seçenek işaretlenip
 * sunucuya gidiliyor, doğru hangisiydi yanıt dönünce öğreniliyor.
 */

export type RunnerFeedback = {
  correct: boolean;
  mastered: boolean;
  correctAnswer: string | null;
  explanation: string | null;
};

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
      <p className="text-xs text-[var(--astra-muted)]">
        {position} / {total}
        {question.wrongCount > 1
          ? ` · bu soruyu ${question.wrongCount} kez yanlış yaptın`
          : ""}
      </p>

      <div className="astra-pay-card p-5">
        <p className="text-base leading-relaxed text-[var(--astra-text)]">
          {question.questionText}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {question.options.map((option) => {
            const isPicked = picked === option;
            const isAnswer =
              feedback?.correctAnswer != null && feedback.correctAnswer === option;
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
                    ? "border-emerald-500/60 bg-emerald-500/10 text-[var(--astra-text)]"
                    : isPicked && feedback && !feedback.correct
                      ? "border-red-500/60 bg-red-500/10 text-[var(--astra-text)]"
                      : isPicked
                        ? "border-amber-500 bg-amber-500/10 text-[var(--astra-text)]"
                        : "border-white/10 text-[var(--astra-muted)] hover:border-white/25",
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
              {feedback.correct ? "Doğru" : "Hâlâ yanlış"}
              {feedback.mastered ? " · bu soru defterden çıktı" : ""}
            </p>

            {feedback.explanation ? (
              <p className="text-sm leading-relaxed text-[var(--astra-muted)]">
                {feedback.explanation}
              </p>
            ) : null}

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
