"use client";

import { dueInLabel, previewReviewIntervals, REVIEW_GRADE, type Sm2Preview, type Sm2State } from "@/lib/learning/review-sm2";

const GRADES = [REVIEW_GRADE.hard, REVIEW_GRADE.good, REVIEW_GRADE.easy] as const;

export function ReviewGradeButtons({
  preview,
  state,
  disabled,
  onGrade,
  className,
}: {
  preview?: Sm2Preview | null;
  state?: Sm2State | null;
  disabled?: boolean;
  onGrade: (quality: 1 | 4 | 5) => void;
  className?: string;
}) {
  const days = preview ?? previewReviewIntervals(state ?? { easeFactor: 2.5, intervalDays: 1, repetitions: 0 });
  const when = { 1: days.hard, 4: days.good, 5: days.easy } as const;

  return (
    <div className={className ?? "cp-review-grades"} role="group" aria-label="Ne kadar hatırladın?">
      {GRADES.map((grade) => (
        <button
          key={grade.quality}
          type="button"
          className={`cp-review-grade cp-review-grade--${grade.quality === 1 ? "hard" : grade.quality === 4 ? "good" : "easy"}`}
          disabled={disabled}
          onClick={() => onGrade(grade.quality)}
        >
          <span className="cp-review-grade-emoji" aria-hidden>
            {grade.emoji}
          </span>
          <span className="cp-review-grade-label">
            {grade.label}
            {grade.hint ? ` / ${grade.hint}` : ""}
          </span>
          <span className="cp-review-grade-when">{dueInLabel(when[grade.quality])}</span>
        </button>
      ))}
    </div>
  );
}
