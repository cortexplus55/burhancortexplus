import { flattenLines, type PodcastChapter, type SpeakerId } from "./podcast-script";

// The generated schema permits 112 turns; sentence splitting can produce more.
export const MAX_PODCAST_AUDIO_LINES = 512;
export const MAX_PODCAST_AUDIO_CHARS = 32_000;
export const MAX_SPEECH_LINE_CHARS = 1_200;

export type PodcastAudioLine = {
  chapterIndex: number;
  speaker: SpeakerId;
  text: string;
  url: string;
  durationMs: number;
};

/** Reject incomplete or mismatched soundtracks before marking playback ready. */
export function validatePodcastAudio(
  chapters: PodcastChapter[],
  value: unknown,
): PodcastAudioLine[] | null {
  const expected = flattenLines(chapters);
  if (!expected.length || !Array.isArray(value) || value.length !== expected.length) return null;
  const valid = value.every((line: unknown, index) => {
    if (!line || typeof line !== "object") return false;
    const item = line as Partial<PodcastAudioLine>;
    const source = expected[index];
    if (item.text !== source.text || item.speaker !== source.speaker || item.chapterIndex !== source.chapterIndex) return false;
    if (typeof item.durationMs !== "number" || !Number.isFinite(item.durationMs) || item.durationMs <= 0) return false;
    if (typeof item.url !== "string") return false;
    try { return new URL(item.url).protocol === "https:"; } catch { return false; }
  });
  return valid ? value as PodcastAudioLine[] : null;
}
