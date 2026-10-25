/**
 * SuperMemo-2 aralıklı tekrar. İstemci ve sunucu paylaşır: kart / tekrar
 * düğmelerindeki "N gün sonra" önizlemesi buradan, kayıt da aynı fonksiyonu
 * kullanır. Ağır ders bağımlılığı yok — `review-items.ts` burayı içe aktarır.
 *
 * İlk basamak Anki tarzı (1 / 4 / 9): klasik SM-2'de ilk iki başarılı cevap
 * aynı 1 günü verirdi, üç düğme de aynı etiketi gösterirdi. Kolaylık katsayısı
 * ve sonraki aralıklar SuperMemo-2 formülüdür. Kalite 5'te ek 1,3 çarpanı var.
 */

export const SM2_DEFAULT_EASE = 2.5;
export const SM2_MIN_EASE = 1.3;
export const SM2_EASY_BONUS = 1.3;
/** Dört başarılı tekrardan sonra (eski 14. gün + doğru) öğrenildi. */
export const SM2_GRADUATE_REPS = 4;

export const REVIEW_QUALITIES = [1, 4, 5] as const;
export type ReviewQuality = (typeof REVIEW_QUALITIES)[number];

export type Sm2State = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
};

export type Sm2Preview = { hard: number; good: number; easy: number };

export const REVIEW_GRADE = {
  hard: { quality: 1 as const, label: "Zorlandım", hint: "Tekrar", emoji: "😓" },
  good: { quality: 4 as const, label: "Hatırladım", hint: "", emoji: "🙂" },
  easy: { quality: 5 as const, label: "Çok Kolaydı", hint: "", emoji: "⚡" },
} as const;

export function qualityFromCorrect(correct: boolean): ReviewQuality {
  return correct ? 4 : 1;
}

export function readQuality(value: unknown): ReviewQuality | null {
  if (value === 1 || value === 4 || value === 5) return value;
  if (value === "1") return 1;
  if (value === "4") return 4;
  if (value === "5") return 5;
  return null;
}

export function clampEase(ease: number): number {
  const n = Number.isFinite(ease) ? ease : SM2_DEFAULT_EASE;
  return Math.max(SM2_MIN_EASE, Math.min(4, Math.round(n * 100) / 100));
}

/** SM-2: EF′ = EF + (0.1 − (5−q)·(0.08 + (5−q)·0.02)), taban 1.3. */
export function nextEase(easeFactor: number, quality: number): number {
  const q = Math.max(0, Math.min(5, quality));
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return clampEase(easeFactor + delta);
}

export function sm2FromStep(step: number): Sm2State {
  const clamped = Math.max(0, Math.min(3, Math.floor(Number(step) || 0)));
  const days = ([1, 3, 7, 14] as const)[clamped] ?? 1;
  return { easeFactor: SM2_DEFAULT_EASE, intervalDays: days, repetitions: clamped };
}

/** `interval_step` CHECK 0–3 canlıda duruyor; SM-2 gününü kaba basamağa sıkıştır. */
export function stepFromInterval(intervalDays: number): number {
  const days = Math.max(1, Math.round(Number(intervalDays) || 1));
  if (days <= 1) return 0;
  if (days <= 4) return 1;
  if (days <= 10) return 2;
  return 3;
}

export function defaultSm2(): Sm2State {
  return { easeFactor: SM2_DEFAULT_EASE, intervalDays: 1, repetitions: 0 };
}

export function readSm2State(item: unknown, step = 0): Sm2State {
  const raw = item && typeof item === "object" ? (item as { sm2?: Partial<Sm2State> }).sm2 : undefined;
  if (
    raw &&
    typeof raw.easeFactor === "number" &&
    typeof raw.intervalDays === "number" &&
    typeof raw.repetitions === "number"
  ) {
    return {
      easeFactor: clampEase(raw.easeFactor),
      intervalDays: Math.max(0, Math.round(raw.intervalDays)),
      repetitions: Math.max(0, Math.floor(raw.repetitions)),
    };
  }
  return sm2FromStep(step);
}

export function applySm2(state: Sm2State, quality: number): Sm2State {
  const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));
  const easeFactor = nextEase(state.easeFactor || SM2_DEFAULT_EASE, q);
  if (q < 3) {
    return { easeFactor, intervalDays: 1, repetitions: 0 };
  }
  let intervalDays: number;
  if (state.repetitions <= 0) {
    intervalDays = q >= 5 ? 9 : 4;
  } else if (state.repetitions === 1) {
    intervalDays = q >= 5 ? 9 : 6;
  } else {
    intervalDays = Math.max(1, Math.round(Math.max(1, state.intervalDays) * easeFactor));
    if (q >= 5) intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * SM2_EASY_BONUS));
  }
  return { easeFactor, intervalDays, repetitions: state.repetitions + 1 };
}

export function previewReviewIntervals(state: Sm2State): Sm2Preview {
  return {
    hard: applySm2(state, 1).intervalDays,
    good: applySm2(state, 4).intervalDays,
    easy: applySm2(state, 5).intervalDays,
  };
}

export function dueInLabel(days: number): string {
  const n = Math.max(1, Math.round(Number(days) || 1));
  return n <= 1 ? "1 gün sonra" : `${n} gün sonra`;
}

export function sm2Graduates(next: Sm2State, quality: number): boolean {
  return quality >= 4 && next.repetitions >= SM2_GRADUATE_REPS;
}
