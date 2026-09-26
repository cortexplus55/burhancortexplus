/**
 * SM-2 tabanlı sadeleştirilmiş aralıklı tekrar.
 * Saf fonksiyon — DB / ağ yok. Sınav tarihi varsa aralık sıkışır.
 */

export type CardRating = "missed" | "hard" | "knew";

export type CardScheduleState = {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  /** Son değerlendirmeler (en yenisi sonda), ustalık için. */
  recentRatings?: CardRating[];
};

export type CardScheduleResult = CardScheduleState & {
  dueAt: Date;
  /** Bilmedim: aynı oturumda kaç kart sonra tekrar gösterilsin. */
  requeueAfter?: number;
  mastered: boolean;
};

const MIN_EASE = 1.3;
const DAY_MS = 86_400_000;

export function daysUntilExamDate(examDate: string, from: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  const start = Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const exam = Date.parse(`${examDate.slice(0, 10)}T00:00:00Z`);
  return Math.ceil((exam - start) / DAY_MS);
}

function clampExamInterval(intervalDays: number, examDate: string | undefined, now: Date): number {
  if (!examDate) return intervalDays;
  const left = daysUntilExamDate(examDate, now);
  if (left <= 0) return Math.min(intervalDays, 1);
  const cap = Math.max(1, Math.floor(left / 2));
  return Math.min(intervalDays, cap);
}

function pushRating(recent: CardRating[] | undefined, rating: CardRating): CardRating[] {
  return [...(recent ?? []), rating].slice(-4);
}

export function isCardMastered(state: Pick<CardScheduleState, "intervalDays" | "reps" | "recentRatings">): boolean {
  if (state.intervalDays >= 7) return true;
  const recent = state.recentRatings ?? [];
  if (state.reps >= 3 && recent.length >= 2) {
    const lastTwo = recent.slice(-2);
    return lastTwo.every((r) => r === "knew");
  }
  return false;
}

/**
 * @param state önceki durum (yeni kart: ease 2.5, interval 0, reps 0, lapses 0)
 * @param rating Bilmedim / Zorlandım / Bildim
 * @param now değerlendirme anı
 * @param examDate ISO tarih (YYYY-MM-DD) — isteğe bağlı sıkıştırma
 */
export function nextCardSchedule(
  state: CardScheduleState,
  rating: CardRating,
  now: Date,
  examDate?: string,
): CardScheduleResult {
  const recentRatings = pushRating(state.recentRatings, rating);

  if (rating === "missed") {
    const ease = Math.max(MIN_EASE, state.ease - 0.2);
    const next: CardScheduleResult = {
      ease,
      intervalDays: 0,
      reps: state.reps,
      lapses: state.lapses + 1,
      recentRatings,
      dueAt: new Date(now.getTime() + 10 * 60_000),
      requeueAfter: 3,
      mastered: false,
    };
    return next;
  }

  if (rating === "hard") {
    const ease = Math.max(MIN_EASE, state.ease - 0.15);
    const base = Math.max(1, state.intervalDays * 1.2);
    const intervalDays = clampExamInterval(base, examDate, now);
    const nextState = {
      ease,
      intervalDays,
      reps: state.reps + 1,
      lapses: state.lapses,
      recentRatings,
    };
    return {
      ...nextState,
      dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
      mastered: isCardMastered(nextState),
    };
  }

  // knew
  let intervalDays: number;
  if (state.reps === 0) intervalDays = 1;
  else if (state.reps === 1) intervalDays = 3;
  else intervalDays = Math.max(1, state.intervalDays * state.ease);

  intervalDays = clampExamInterval(intervalDays, examDate, now);
  const ease = state.ease;
  const nextState = {
    ease,
    intervalDays,
    reps: state.reps + 1,
    lapses: state.lapses,
    recentRatings,
  };
  return {
    ...nextState,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    mastered: isCardMastered(nextState),
  };
}

/** Önizleme: buton altındaki "N gün sonra" / "10 dk sonra" metni. */
export function scheduleHint(result: CardScheduleResult): string {
  if (result.requeueAfter != null || result.intervalDays === 0) {
    return "10 dk sonra";
  }
  const days = Math.max(1, Math.round(result.intervalDays));
  return days === 1 ? "1 gün sonra" : `${days} gün sonra`;
}
