"use client";

import {
  streakFreezeTitle,
  type StreakFreezeBadgeState,
} from "@/lib/learning/streak-freeze-copy";

export type { StreakFreezeBadgeState };

/** Üst çubuk ve ilerleme: 🧊 rozeti + ipucu. */
export function StreakFreezeBadge({
  state,
  compact = false,
}: {
  state: StreakFreezeBadgeState;
  compact?: boolean;
}) {
  const title = streakFreezeTitle(state);
  const lit = state.protected || state.used || state.remaining > 0;
  return (
    <span
      className={`cp-streak-freeze${lit ? " is-on" : ""}${state.protected || state.used ? " is-saved" : ""}`}
      title={title}
      aria-label={title}
    >
      <span aria-hidden>🧊</span>
      {compact ? null : <span className="cp-streak-freeze-label">{state.protected || state.used ? "Kalkan" : state.remaining}</span>}
    </span>
  );
}
