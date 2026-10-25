import {
  DUO_WORDS_PER_MINUTE,
  SINGLE_WORDS_PER_MINUTE,
  podcastLengthSpec,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";

/**
 * Söz verilen süre ile ölçülen süre. Kelime bandı istem metninden okunur;
 * sabit bir dersin kelime listesi yoktur.
 */

export const PODCAST_DURATION_ROUND_MS = 20_000;
const PROMISE_TOLERANCE = 0.2;

export type TimedScript = {
  length: PodcastLength;
  chapters: { title?: string; lines: { speaker?: string; text: string }[]; durationMs?: number }[];
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function scriptWords(episode: TimedScript): number {
  return countWords(episode.chapters.flatMap((chapter) => chapter.lines.map((line) => line.text)).join(" "));
}

/** "toplam 860-1000 kelime" bandı. İstemde yoksa null. */
export function wordBand(length: PodcastLength): { min: number; max: number } | null {
  const match = podcastLengthSpec(length).brief.match(/toplam\s+(\d+)\s*[-–]\s*(\d+)\s+kelime/);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
}

export function wordsPerMinute(speakers: "single" | "duo"): number {
  return speakers === "duo" ? DUO_WORDS_PER_MINUTE : SINGLE_WORDS_PER_MINUTE;
}

export function estimatedMinutes(words: number, speakers: "single" | "duo"): number {
  if (words <= 0) return 0;
  return words / wordsPerMinute(speakers);
}

/** Söz verilen dakikanın ±%20 penceresi. */
export function durationWithinPromise(measuredMinutes: number, promisedMinutes: number): boolean {
  if (!(promisedMinutes > 0) || !(measuredMinutes >= 0)) return false;
  const low = promisedMinutes * (1 - PROMISE_TOLERANCE);
  const high = promisedMinutes * (1 + PROMISE_TOLERANCE);
  return measuredMinutes >= low - 1e-9 && measuredMinutes <= high + 1e-9;
}

/**
 * Kelime bandının dakika karşılığı sözü tutmuyorsa etiket süre yazmaz.
 * Ölçülmüş süre varsa o yazılır; o da pencerenin dışındaysa etiket boş kalır.
 */
export function honestFormatLabel(length: PodcastLength, measuredMinutes?: number | null): string {
  const spec = podcastLengthSpec(length);
  if (measuredMinutes != null && measuredMinutes > 0) {
    if (!durationWithinPromise(measuredMinutes, spec.minutes)) return "";
    return `~${Math.max(1, Math.round(measuredMinutes))} dk`;
  }
  const band = wordBand(length);
  if (band) {
    const mid = estimatedMinutes((band.min + band.max) / 2, spec.speakers);
    if (!durationWithinPromise(mid, spec.minutes)) return "";
  }
  return `~${spec.minutes} dk`;
}

export type DurationDirection = "expand" | "shorten";

/** Bandın altı genişler. Tahmin ±%20 dışındaysa bir tur genişler ya da kısalır. */
export function durationRoundNeeded(episode: TimedScript): DurationDirection | null {
  const spec = podcastLengthSpec(episode.length);
  const words = scriptWords(episode);
  const band = wordBand(episode.length);
  const minutes = estimatedMinutes(words, spec.speakers);
  if (band && words < band.min) return "expand";
  if (band && words > band.max) return "shorten";
  if (minutes < spec.minutes * (1 - PROMISE_TOLERANCE)) return "expand";
  if (minutes > spec.minutes * (1 + PROMISE_TOLERANCE)) return "shorten";
  return null;
}

export function durationMovesToward(beforeWords: number, afterWords: number, direction: DurationDirection): boolean {
  const step = Math.max(12, Math.round(beforeWords * 0.08));
  if (direction === "expand") return afterWords >= beforeWords + step;
  return afterWords <= beforeWords - step;
}

export function durationRoundPrompt(episode: TimedScript, direction: DurationDirection): { system: string; user: string } {
  const spec = podcastLengthSpec(episode.length);
  const band = wordBand(episode.length);
  const bandText = band ? `${band.min}-${band.max}` : "istemdeki";
  return {
    system:
      "Süre ayarı yapan öğretmensin. Anlatımdaki bilgiyi koru. Yeni sayı, tarih, formül ya da kural ekleme. " +
      "Konuşmacı adları yalnız Ada ve Kerem olsun. Övgü cümlesi ve sınav talimatı yazma. Yalnızca JSON döndür.",
    user: [
      direction === "expand"
        ? `Metin ${bandText} kelime bandının altında. Aynı bilgileri açarak bandın içine getir.`
        : `Metin ${bandText} kelime bandının üstünde. Aynı bilgileri koruyarak bandın içine indir.`,
      `Söz verilen süre yaklaşık ${spec.minutes} dakika. Bölüm sayısı ${spec.minChapters}-${spec.maxChapters} kalsın.`,
      JSON.stringify({ title: (episode as { title?: string }).title ?? "", chapters: episode.chapters }),
    ].join("\n\n"),
  };
}

/** Konuşmacı payı: diyalogda Kerem'in kelimeleri %35-50. Tek anlatıcıda kontrol yok. */
export function keremShareIssue(episode: TimedScript): string | null {
  if (podcastLengthSpec(episode.length).speakers !== "duo") return null;
  let kerem = 0;
  let total = 0;
  for (const chapter of episode.chapters) {
    for (const line of chapter.lines) {
      const words = countWords(line.text);
      total += words;
      if (line.speaker === "kerem") kerem += words;
    }
  }
  if (total < 20) return null;
  const share = kerem / total;
  if (share >= 0.35 && share <= 0.5) return null;
  return `Kerem'in payı %${Math.round(share * 100)}; diyalogda %35-50 olmalı.`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds} sn`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Kelime hızından bölüm süresi. Gerçek ses gelince oynatıcı bunu ezer. */
export function stampEstimatedDurations<T extends TimedScript>(episode: T): T {
  const perMinute = wordsPerMinute(podcastLengthSpec(episode.length).speakers);
  return {
    ...episode,
    chapters: episode.chapters.map((chapter) => ({
      ...chapter,
      durationMs: Math.max(1_000, Math.round((countWords(chapter.lines.map((line) => line.text).join(" ")) / perMinute) * 60_000)),
    })),
  };
}

/** Satır seslerinin toplamı: bölümün gerçek süresi. */
export function measuredChapterMs(lineDurationsMs: readonly number[]): number {
  return lineDurationsMs.reduce((sum, ms) => sum + (Number.isFinite(ms) ? ms : 0), 0);
}
