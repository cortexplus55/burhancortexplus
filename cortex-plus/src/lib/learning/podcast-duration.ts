import {
  DUO_WORDS_PER_MINUTE,
  podcastLengthSpec,
  SINGLE_WORDS_PER_MINUTE,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";

/** Taban ve tavana göre sapma payı (ölçülen ses süresi). Her tür ve her ders için aynı oran. */
export const DURATION_TOLERANCE = 0.2;
/**
 * Tek süre turu (yalnız tavanı aşan metni kısaltır). 28 Ekim 2026 (Paket A): 22 sn'ydi; 7 dakikalık metnin JSON'u
 * bu sürede yeniden yazılamıyor, tur hep zaman aşımına düşüyordu. Öğrenci ikinci kez ücretlenmez; tur düşünce eldeki
 * metin kalır.
 */
export const DURATION_ROUND_TIMEOUT_MS = 60_000;

export type DurationRound = "expand" | "shorten";
export type DurationVerdict = "short" | "long" | "ok";

/** Tipik süre (oturum kaydı); söz değil. */
export function promisedMs(length: PodcastLength): number {
  return podcastLengthSpec(length).minutes * 60_000;
}

export function estimatedDurationMs(words: number, speakers: "single" | "duo"): number {
  const perMinute = speakers === "duo" ? DUO_WORDS_PER_MINUTE : SINGLE_WORDS_PER_MINUTE;
  if (perMinute <= 0) return 0;
  return Math.round((Math.max(0, words) / perMinute) * 60_000);
}

/** Ölçülen süre taban/tavan aralığıyla karşılaştırılır (28 Ekim 2026: uzunluk konuya göre, tek bir söz yok). */
export function durationVerdict(measuredMs: number, length: PodcastLength): DurationVerdict {
  if (measuredMs <= 0) return "ok";
  const spec = podcastLengthSpec(length);
  const floor = estimatedDurationMs(spec.words.min, spec.speakers);
  const ceiling = estimatedDurationMs(spec.words.max, spec.speakers);
  if (floor > 0 && measuredMs < floor * (1 - DURATION_TOLERANCE)) return "short";
  if (ceiling > 0 && measuredMs > ceiling * (1 + DURATION_TOLERANCE)) return "long";
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

/** Aralığa uzaklık (içindeyse 0). */
function bandDistance(words: number, band: { min: number; max: number }): number {
  if (words < band.min) return band.min - words;
  if (words > band.max) return words - band.max;
  return 0;
}

/** Tur sonucu aralığa yaklaştıysa (ya da içine girdiyse) kabul edilir. */
export function closerToBand(before: number, after: number, length: PodcastLength): boolean {
  const band = podcastLengthSpec(length).words;
  return bandDistance(after, band) < bandDistance(before, band);
}

export function durationRoundInstruction(round: DurationRound, length: PodcastLength): string {
  const band = podcastLengthSpec(length).words;
  if (round === "expand") {
    return (
      `Konuşma tabanın altında. Toplam kelime en az ${band.min} olsun (en çok ${band.max}). ` +
      "Yeni bir neden, örnek veya karşılaştırma ekle; var olan cümleleri tekrar etme. " +
      "Sayı, eşik, tarih, madde numarası ve sıralı adım yalnız kaynakta geçenlerden olsun."
    );
  }
  return (
    `Konuşma tavanı (~10 dakika) aşıyor. Toplam kelime en çok ${band.max} olsun (en az ${band.min}). ` +
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
