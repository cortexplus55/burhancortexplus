"use client";

import { cn } from "@/lib/utils";
import { coachReaction, streakBadge, type CoachInput } from "@/lib/learning/coach-reactions";
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

/**
 * Derste adım kıvılcımı: girilen adımın başında, düğme satırıyla başlığın arasında kendi yerinde durur ve o adım
 * boyunca kalır (28 Kasım 2026). Önce üst çubuğun altında 2,6 sn süzülüyor, "Ders özeti" düğmesinin ya da adım
 * başlığının üstüne biniyordu; kendiliğinden kalksaydı da içerik yukarı kayardı.
 */
export function LessonSpark({ text, token }: { text: string | null; token: number }) {
  if (!text) return null;
  return (
    <p key={token} className="cp-spark" role="status">
      {text}
    </p>
  );
}
