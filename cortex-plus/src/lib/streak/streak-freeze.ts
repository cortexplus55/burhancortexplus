/**
 * Seri Kalkanı (streak freeze). Saf: gün aralığı ve haftalık hak.
 * Kayıt `user_activity_days.source = streak_freeze` — yeni kolon gerekmez.
 */

export const STREAK_FREEZE_SOURCE = "streak_freeze";
export const FREE_FREEZES_PER_WEEK = 1;
export const PLUS_FREEZES_PER_WEEK = 2;

export type StreakFreezeView = {
  streak: number;
  remaining: number;
  allowance: number;
  /** Bu istekte (veya bu boşlukta) kalkan kullanıldı. */
  used: boolean;
  /** Gösterilen seri kalkanla ayakta. */
  protected: boolean;
};

export function freezeAllowance(isPremium: boolean): number {
  return isPremium ? PLUS_FREEZES_PER_WEEK : FREE_FREEZES_PER_WEEK;
}

export function addCalendarDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Son çalışma bugünden tam 2 gün önceyse kaçırılan gün dündür. */
export function missedDayIfOneGap(last: string | null | undefined, today: string): string | null {
  if (!last) return null;
  const day = String(last).slice(0, 10);
  return addCalendarDays(day, 2) === today ? addCalendarDays(today, -1) : null;
}

export function nextStreakAfterActivity(input: {
  existing: { current: number; last: string | null } | null;
  today: string;
  yesterday: string;
  /** Bir günlük boşlukta kalkan hakkı kaldı mı? */
  canFreeze: boolean;
}): { current: number; freezeUsed: boolean; missedDay: string | null } {
  if (!input.existing) return { current: 1, freezeUsed: false, missedDay: null };
  const last = input.existing.last;
  if (last === input.today) return { current: input.existing.current || 1, freezeUsed: false, missedDay: null };
  if (last === input.yesterday) {
    return { current: (input.existing.current || 0) + 1, freezeUsed: false, missedDay: null };
  }
  const missed = missedDayIfOneGap(last, input.today);
  if (missed && (input.existing.current || 0) >= 2 && input.canFreeze) {
    return { current: (input.existing.current || 0) + 1, freezeUsed: true, missedDay: missed };
  }
  return { current: 1, freezeUsed: false, missedDay: missed };
}

export function liveStreakWithFreeze(input: {
  current: number;
  last: string | null;
  today: string;
  remaining: number;
}): { streak: number; protected: boolean } {
  const last = input.last ? String(input.last).slice(0, 10) : null;
  if (!last) return { streak: input.current || 0, protected: false };
  const yesterday = addCalendarDays(input.today, -1);
  if (last === input.today || last === yesterday) {
    return { streak: input.current || 0, protected: false };
  }
  const missed = missedDayIfOneGap(last, input.today);
  if (missed && input.current >= 2 && input.remaining > 0) {
    return { streak: input.current, protected: true };
  }
  return { streak: 0, protected: false };
}
