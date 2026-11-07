"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { coachReaction, SPARK_MS, streakBadge, type CoachInput } from "@/lib/learning/coach-reactions";
import "@/styles/coach.css";

/** Canlı seri rozeti: 2'den başlar; hareket azaltmada sadece görünür, parlamaz. */
export function StreakBadge({ streak, className }: { streak: number; className?: string }) {
  const label = streakBadge(streak);
  if (!label) return null;
  return (
    <span key={streak} className={cn("cp-streak", streak >= 5 && "cp-streak--hot", className)} role="status">
      {label}
    </span>
  );
}

/** Cevaptan sonra koç cümlesi (test, doğru/yanlış). */
export function CoachLine({ input, className }: { input: CoachInput; className?: string }) {
  const reaction = coachReaction(input);
  return (
    <p className={cn("cp-coach", `cp-coach--${reaction.tone}`, className)} role="status">
      {reaction.text}
    </p>
  );
}

/** Derste adım kıvılcımı: kısa süre görünür, sonra kendiliğinden kalkar. */
export function LessonSpark({ text, token }: { text: string | null; token: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!text) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), SPARK_MS);
    return () => window.clearTimeout(timer);
  }, [text, token]);
  if (!text || !visible) return null;
  return (
    <p key={token} className="cp-spark" role="status">
      {text}
    </p>
  );
}
