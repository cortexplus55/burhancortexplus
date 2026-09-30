"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "great", emoji: "👍", label: "Harikaydı" },
  { id: "too_easy", emoji: "🥱", label: "Çok kolaydı" },
  { id: "too_hard", emoji: "😵", label: "Çok zordu" },
] as const;

/**
 * "Bu dersi nasıl buldun?" — Astra'nın sonuç ekranındaki anket.
 * Cevap denemenin kaydına yazılıyor (`/api/learning/exam-prep/rating`).
 */
export function LessonRatingCard({ attemptId }: { attemptId: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function rate(rating: (typeof OPTIONS)[number]["id"]) {
    setChosen(rating);
    setFailed(false);
    try {
      const res = await fetch("/api/learning/exam-prep/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, rating }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setChosen(null);
      setFailed(true);
    }
  }

  return (
    <div className="cp-rating-card">
      <p className="cp-rating-lead">Öğrenme planını geliştirmemize yardım et</p>
      <p className="cp-rating-question">Bu dersi nasıl buldun?</p>
      {chosen ? (
        <p className="cp-rating-thanks" role="status">
          Teşekkürler, kaydettik.
        </p>
      ) : (
        <div className="cp-rating-options" role="group" aria-label="Bu dersi nasıl buldun?">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn("cp-rating-option")}
              onClick={() => void rate(option.id)}
            >
              <span aria-hidden>{option.emoji}</span>
              {option.label}
            </button>
          ))}
        </div>
      )}
      {failed ? (
        <p className="cp-rating-error" role="alert">
          Kaydedilemedi, bir kez daha dener misin?
        </p>
      ) : null}
    </div>
  );
}
