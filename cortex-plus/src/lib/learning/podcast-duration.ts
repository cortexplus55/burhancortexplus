import {
  DUO_WORDS_PER_MINUTE,
  podcastLengthSpec,
  SINGLE_WORDS_PER_MINUTE,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";

/** Söz verilen süreye göre sapma. Her tür ve her ders için aynı oran. */
export const DURATION_TOLERANCE = 0.2;
/** Tek süre turu. Öğrenci ikinci kez ücretlenmez; tur düşünce eldeki metin kalır. */
export const DURATION_ROUND_TIMEOUT_MS = 22_000;

export type DurationRound = "expand" | "shorten";
export type DurationVerdict = "short" | "long" | "ok";

export function promisedMs(length: PodcastLength): number {
  return podcastLengthSpec(length).minutes * 60_000;
}

export function estimatedDurationMs(words: number, speakers: "single" | "duo"): number {
  const perMinute = speakers === "duo" ? DUO_WORDS_PER_MINUTE : SINGLE_WORDS_PER_MINUTE;
  if (perMinute <= 0) return 0;
  return Math.round((Math.max(0, words) / perMinute) * 60_000);
}

export function durationVerdict(measuredMs: number, length: PodcastLength): DurationVerdict {
  const target = promisedMs(length);
  if (target <= 0 || measuredMs <= 0) return "ok";
  if (measuredMs < target * (1 - DURATION_TOLERANCE)) return "short";
  if (measuredMs > target * (1 + DURATION_TOLERANCE)) return "long";
  return "ok";
}

/**
 * Ölçülen süre varsa o karar verir (kelime bandı tutsa da). Yoksa kelime bandı.
 * Bant içinde ve ölçüm ±%20 içindeyse tur yok.
 */
export function durationRoundFor(input: {
  length: PodcastLength;
  words: number;
  measuredMs?: number | null;
}): DurationRound | null {
  if (input.measuredMs != null && input.measuredMs > 0) {
    const verdict = durationVerdict(input.measuredMs, input.length);
    if (verdict === "short") return "expand";
    if (verdict === "long") return "shorten";
    return null;
  }
  const band = podcastLengthSpec(input.length).words;
  if (input.words < band.min) return "expand";
  if (input.words > band.max) return "shorten";
  return null;
}

/** Etiket, kelime bandının orta noktasının ±%20'sindeyse söz verilen dakika kalır; değilse orta nokta. */
export function deliverableMinutes(length: PodcastLength): number {
  const spec = podcastLengthSpec(length);
  const perMinute = spec.speakers === "duo" ? DUO_WORDS_PER_MINUTE : SINGLE_WORDS_PER_MINUTE;
  const midMinutes = (spec.words.min + spec.words.max) / 2 / perMinute;
  const low = midMinutes * (1 - DURATION_TOLERANCE);
  const high = midMinutes * (1 + DURATION_TOLERANCE);
  if (spec.minutes >= low && spec.minutes <= high) return spec.minutes;
  return Math.max(1, Math.round(midMinutes));
}

export function closerToBand(before: number, after: number, length: PodcastLength): boolean {
  const band = podcastLengthSpec(length).words;
  const mid = (band.min + band.max) / 2;
  return Math.abs(after - mid) < Math.abs(before - mid);
}

export function durationRoundInstruction(round: DurationRound, length: PodcastLength): string {
  const band = podcastLengthSpec(length).words;
  if (round === "expand") {
    return (
      `Konuşma söz verilen süreden kısa. Toplam kelime ${band.min}-${band.max} bandına gelsin. ` +
      "Yeni bir neden, örnek veya karşılaştırma ekle; var olan cümleleri tekrar etme. " +
      "Sayı, eşik, tarih, madde numarası ve sıralı adım yalnız kaynakta geçenlerden olsun."
    );
  }
  return (
    `Konuşma söz verilen süreden uzun. Toplam kelime ${band.min}-${band.max} bandına gelsin. ` +
    "Tekrar eden cümleleri ve bilgi taşımayan onayları çıkar. Kalan her cümle bir bilgi, bir neden veya bir örnek taşısın."
  );
}

export function stampChapterDurations<T extends { lines: { durationMs?: number }[] }>(
  chapters: readonly T[],
): (T & { durationMs: number })[] {
  return chapters.map((chapter) => ({
    ...chapter,
    durationMs: chapter.lines.reduce((sum, line) => sum + (line.durationMs ?? 0), 0),
  }));
}

export function sumDurationMs(lines: readonly { durationMs?: number }[]): number {
  return lines.reduce((sum, line) => sum + (line.durationMs ?? 0), 0);
}

/** Tur geç dönerse veya düşerse null. Geç gelen red yakalanır, söz verilmez. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
