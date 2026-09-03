/**
 * İki sesli podcast senaryosu.
 *
 * Senaryo satır satır geliyor ve her satır tek cümle: sesi cümle başına
 * ürettiğimiz için her cümlenin gerçek süresi ölçülebiliyor, transkript
 * senkronu tahmine dayanmıyor.
 *
 * Eski kayıtlar `chapters[].script` biçiminde tek metindi. O kayıtlar hâlâ
 * açılabilsin diye buradaki normalleştirme ikisini de kabul ediyor; eski
 * biçim tek anlatıcıya düşer — monoloğu iki sese bölmek konuşmayı
 * uydurmak olurdu.
 */

export const SPEAKERS = ["ada", "kerem"] as const;
export type SpeakerId = (typeof SPEAKERS)[number];

export const SPEAKER_LABEL: Record<SpeakerId, string> = {
  ada: "Ada",
  kerem: "Kerem",
};

export type PodcastLine = { speaker: SpeakerId; text: string };
export type PodcastChapter = { title: string; lines: PodcastLine[] };

/** Zamanlama eklenmiş, oynatıcının üzerinde yürüdüğü birim. */
export type TimedLine = PodcastLine & {
  chapterIndex: number;
  /** Parçanın kendi ses dosyasındaki sırası; depolama yolu bununla kurulur. */
  index: number;
  startMs: number;
  endMs: number;
};

function asSpeaker(value: unknown, fallback: SpeakerId): SpeakerId {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (SPEAKERS as readonly string[]).includes(raw)
    ? (raw as SpeakerId)
    : fallback;
}

/**
 * Türkçe cümle ayırıcı. Ondalık sayı (3.14) ve yaygın kısaltmalarda
 * (vb., örn., Dr., M.Ö.) bölmemesi gerekiyor; yoksa tek cümle ortasından
 * kesilir ve ses parçaları anlamsız yerlerden başlar.
 */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const out: string[] = [];
  let buffer = "";

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    buffer += ch;
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;

    const next = clean[i + 1];
    const afterNext = clean[i + 2];
    // Cümle sonu ancak boşluk (ya da metin sonu) geliyorsa.
    if (next && next !== " ") continue;
    if (ch === "." && isAbbreviation(buffer)) continue;
    // "3. sınıf" gibi sıra sayılarında bölme.
    if (ch === "." && /\d\.$/.test(buffer) && afterNext && !/[A-ZÇĞİÖŞÜ]/.test(afterNext)) {
      continue;
    }

    out.push(buffer.trim());
    buffer = "";
    i += 1; // tüketilen boşluk
  }

  const rest = buffer.trim();
  if (rest) out.push(rest);
  return out;
}

const ABBREVIATIONS = [
  "vb.",
  "vs.",
  "örn.",
  "bkz.",
  "dr.",
  "prof.",
  "doç.",
  "sn.",
  "no.",
  "ör.",
  "m.ö.",
  "m.s.",
  "yy.",
];

function isAbbreviation(buffer: string): boolean {
  const tail = buffer.toLowerCase();
  return ABBREVIATIONS.some((abbr) => tail.endsWith(abbr));
}

/**
 * Model çıktısını oynatılabilir biçime çevirir. Çok cümleli satırlar
 * bölünür: senkronun birimi cümle, satır değil.
 */
export function normalizeChapters(raw: unknown): PodcastChapter[] {
  if (!Array.isArray(raw)) return [];

  const chapters: PodcastChapter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";

    const lines: PodcastLine[] = [];
    if (Array.isArray(row.lines)) {
      let previous: SpeakerId = "ada";
      for (const lineRaw of row.lines) {
        if (!lineRaw || typeof lineRaw !== "object") continue;
        const line = lineRaw as Record<string, unknown>;
        const text = typeof line.text === "string" ? line.text : "";
        const speaker = asSpeaker(line.speaker, previous);
        previous = speaker;
        for (const sentence of splitSentences(text)) {
          lines.push({ speaker, text: sentence });
        }
      }
    } else if (typeof row.script === "string") {
      // Eski biçim: tek anlatıcı.
      for (const sentence of splitSentences(row.script)) {
        lines.push({ speaker: "ada", text: sentence });
      }
    }

    if (lines.length) chapters.push({ title: title || "Bölüm", lines });
  }

  return chapters;
}

/** Ses üretimi ve depolama için sıralı düz liste. */
export function flattenLines(
  chapters: PodcastChapter[],
): { chapterIndex: number; index: number; speaker: SpeakerId; text: string }[] {
  const out: {
    chapterIndex: number;
    index: number;
    speaker: SpeakerId;
    text: string;
  }[] = [];
  let index = 0;
  chapters.forEach((chapter, chapterIndex) => {
    for (const line of chapter.lines) {
      out.push({ chapterIndex, index, speaker: line.speaker, text: line.text });
      index += 1;
    }
  });
  return out;
}

/**
 * Ölçülen sürelerden zaman çizelgesi kurar. Süreler gerçek ses
 * dosyalarından geldiği için başlangıç/bitiş değerleri tahmin değil.
 */
export function buildTimeline(
  chapters: PodcastChapter[],
  durationsMs: number[],
): TimedLine[] {
  const flat = flattenLines(chapters);
  let cursor = 0;
  return flat.map((line) => {
    const duration = Math.max(0, durationsMs[line.index] ?? 0);
    const startMs = cursor;
    cursor += duration;
    return { ...line, startMs, endMs: cursor };
  });
}

export function totalDurationMs(timeline: TimedLine[]): number {
  return timeline.length ? timeline[timeline.length - 1].endMs : 0;
}

/** Verilen ana denk gelen satır; hiçbiri yoksa -1. */
export function lineAt(timeline: TimedLine[], ms: number): number {
  if (ms < 0) return -1;
  for (let i = 0; i < timeline.length; i += 1) {
    if (ms < timeline[i].endMs) return i;
  }
  return -1;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
