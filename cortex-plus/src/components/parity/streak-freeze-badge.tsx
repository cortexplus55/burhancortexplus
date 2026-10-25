"use client";

export type StreakFreezeBadgeState = {
  remaining: number;
  protected: boolean;
  used: boolean;
};

export const STREAK_FREEZE_COPY = {
  saved: "Seri Kalkanı seni korudu!",
  ready: "Seri Kalkanı hazır",
  none: "Bu hafta kalkanın bitti",
} as const;

export function streakFreezeTitle(state: StreakFreezeBadgeState): string {
  if (state.protected || state.used) return STREAK_FREEZE_COPY.saved;
  if (state.remaining > 0) {
    return state.remaining === 1
      ? `${STREAK_FREEZE_COPY.ready} · bu hafta 1 hakkın var`
      : `${STREAK_FREEZE_COPY.ready} · bu hafta ${state.remaining} hakkın var`;
  }
  return STREAK_FREEZE_COPY.none;
}

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
