/**
 * Spaced review scheduler — baseline 1/3/7/14/30, success adjusts, exam date caps.
 */

import { REVIEW_INTERVALS_DAYS_V1 } from "@/lib/adaptive/config/mastery-v1";

export function nextReviewIntervalDays(input: {
  currentIntervalDays: number;
  success: boolean;
  examDate: string | null;
  from?: Date;
}): { intervalDays: number; dueAt: Date } {
  const from = input.from ?? new Date();
  const ladder = [...REVIEW_INTERVALS_DAYS_V1];
  let idx = ladder.findIndex((d) => d >= input.currentIntervalDays);
  if (idx < 0) idx = ladder.length - 1;

  if (input.success) {
    idx = Math.min(ladder.length - 1, idx + 1);
  } else {
    idx = Math.max(0, idx - 1);
  }

  let intervalDays: number = ladder[idx] ?? 1;

  if (input.examDate) {
    const exam = new Date(`${input.examDate}T23:59:59`);
    const daysLeft = Math.max(
      0,
      Math.ceil((exam.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );
    // Final days: never schedule beyond exam; prefer short intervals.
    if (daysLeft <= 3) intervalDays = Math.min(intervalDays, 1);
    else if (daysLeft <= 7) intervalDays = Math.min(intervalDays, 3);
    else intervalDays = Math.min(intervalDays, Math.max(1, daysLeft - 1));
  }

  const dueAt = new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  if (input.examDate) {
    const exam = new Date(`${input.examDate}T12:00:00`);
    if (dueAt > exam) {
      dueAt.setTime(exam.getTime());
    }
  }

  return { intervalDays, dueAt };
}

export function initialReviewDue(from = new Date()): {
  intervalDays: number;
  dueAt: Date;
} {
  return nextReviewIntervalDays({
    currentIntervalDays: 1,
    success: true,
    examDate: null,
    from,
  });
}
