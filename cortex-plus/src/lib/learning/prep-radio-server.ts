import "server-only";
import { createHash } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/server";
import { audioHash } from "@/lib/ai/speech";
import { cachedAudioOnly, readCachedAudio, type AudioRequest } from "@/lib/learning/audio-cache";
import { MAX_PODCAST_AUDIO_CHARS, MAX_PODCAST_AUDIO_LINES, MAX_SPEECH_LINE_CHARS } from "@/lib/learning/podcast-audio-contract";
import { PLAIN_PODCAST_KEY_SUFFIX, podcastTopicKey } from "@/lib/learning/podcast-episode";
import { flattenLines, normalizeChapters, type SpeakerId } from "@/lib/learning/podcast-script";
import { podcastLineSpeech } from "@/lib/learning/podcast-speech";
import { orderRadioPlaylist, type RadioCandidate, type RadioItem } from "@/lib/learning/prep-radio";
import { studentOutputPayload } from "@/lib/learning/student-output-firewall";

/**
 * Sınav Radyosu sunucu tarafı (Faz 7, 20 Kasım 2026). Kaynak yalnız `exam_prep_podcasts` (hazırlığın kayıtlı
 * bölümleri; yol, hazırlık podcast'i ve ders sonu "Şimdi dinle" buraya yazar). Ses yalnız önbellekten
 * (`cachedAudioOnly`): seslendirme, kredi ayırma ve kullanım kaydı bu dosyada YOK ve olmamalı (bekçi:
 * `sinav-radyosu.test.ts`). Sahiplik her okumada: hazırlık ve bölüm öğrencinin.
 *
 * Önbellek anahtarı oynatıcının istediği metinden kurulur. Yol adımının bölümü öğrenciye öğrenci-çıktı süzgecinden
 * geçerek (`studentOutputPayload`), hazırlığın podcast sayfası kayıttaki hâliyle gider; ikisi de denenir, satırların
 * hepsi önbellekte olan biçim çalınır.
 */

type Service = ReturnType<typeof createServiceClient>;

/** Sayfa açılışında taranan en çok bölüm (en yeniler). */
export const RADIO_MAX_CANDIDATES = 40;

type PodcastRow = {
  id: string;
  topic_key: string | null;
  topic_label: string | null;
  title: string | null;
  chapters: unknown;
  created_at: string | null;
};

export type RadioLine = { chapterIndex: number; speaker: SpeakerId; text: string; url: string; durationMs: number };

type SpeechVariant = { lines: { chapterIndex: number; speaker: SpeakerId; text: string }[]; speech: AudioRequest[]; hashes: string[] };

/** Bir bölümün çalınabilir biçimleri (süzülmüş ve kayıttaki); ses ucunun sınırlarını aşan biçim düşer. */
function speechVariants(chapters: unknown): SpeechVariant[] {
  const sources = [studentOutputPayload(Array.isArray(chapters) ? chapters : []), chapters];
  const out: SpeechVariant[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const lines = flattenLines(normalizeChapters(source));
    if (!lines.length || lines.length > MAX_PODCAST_AUDIO_LINES) continue;
    const speech = lines.map((line) => ({ text: podcastLineSpeech(line), speaker: line.speaker }));
    if (
      lines.some((line) => line.text.length > MAX_SPEECH_LINE_CHARS) ||
      speech.some((line) => line.text.length > MAX_SPEECH_LINE_CHARS) ||
      speech.reduce((sum, line) => sum + line.text.length, 0) > MAX_PODCAST_AUDIO_CHARS
    ) {
      continue;
    }
    const hashes = speech.map((line) => audioHash(line.text, line.speaker));
    const key = hashes.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      lines: lines.map((line) => ({ chapterIndex: line.chapterIndex, speaker: line.speaker, text: line.text })),
      speech,
      hashes,
    });
  }
  return out;
}

function baseTopicKey(key: string | null): string {
  const clean = (key ?? "").trim();
  return clean.endsWith(PLAIN_PODCAST_KEY_SUFFIX) ? clean.slice(0, -PLAIN_PODCAST_KEY_SUFFIX.length) : clean;
}

function signatureOf(row: PodcastRow, variant: SpeechVariant | undefined): string {
  return createHash("sha256")
    .update(`${(row.title ?? "").trim()}|${variant ? variant.hashes.join(",") : row.id}`)
    .digest("hex");
}

/**
 * Sayfa için çalma listesi: sesi TAMAMEN önbellekte olan bölümler, hazırlığın konu sırasıyla. Okuma düşerse boş
 * liste (düğme görünmez); hiçbir şey üretilmez.
 */
export async function loadPrepRadio(
  service: Service,
  input: { prepId: string; userId: string; topicLabels: readonly string[] },
): Promise<RadioItem[]> {
  try {
    const { data, error } = await service
      .from("exam_prep_podcasts")
      .select("id, topic_key, topic_label, title, chapters, created_at")
      .eq("exam_prep_id", input.prepId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(RADIO_MAX_CANDIDATES);
    if (error || !data?.length) return [];
    const rows = (data as PodcastRow[]).map((row) => ({ row, variants: speechVariants(row.chapters) }));
    const cached = await readCachedAudio(service, rows.flatMap((entry) => entry.variants.flatMap((variant) => variant.hashes)));
    const candidates: RadioCandidate[] = rows.flatMap(({ row, variants }) => {
      const playable = variants.find((variant) => variant.hashes.every((hash) => cached.has(hash)));
      if (!playable) return [];
      const topicLabel = (row.topic_label ?? "").trim();
      return [{
        id: row.id,
        title: (row.title ?? "").trim() || topicLabel || "Podcast",
        topicLabel,
        topicKey: baseTopicKey(row.topic_key) || podcastTopicKey(topicLabel),
        createdAt: row.created_at ?? "",
        signature: signatureOf(row, playable),
      }];
    });
    const order = input.topicLabels.map((label) => podcastTopicKey(label)).filter(Boolean);
    return orderRadioPlaylist(candidates, order).map(({ id, title, topicLabel }) => ({ id, title, topicLabel }));
  } catch (caught) {
    console.warn("prep_radio_list_failed", { code: caught instanceof Error ? caught.message : "throw" });
    return [];
  }
}

export type RadioEpisode =
  | { ok: true; item: RadioItem; lines: RadioLine[] }
  | { ok: false; code: "not_found" | "not_cached" | "audio_unavailable" };

/** Tek bölümün sesi, yalnız önbellekten; sahiplik hazırlıkta ve bölümde ayrı ayrı. */
export async function radioEpisodeAudio(
  service: Service,
  input: { prepId: string; userId: string; podcastId: string },
): Promise<RadioEpisode> {
  const [prepRead, podcastRead] = await Promise.all([
    service.from("exam_preps").select("id").eq("id", input.prepId).eq("user_id", input.userId).maybeSingle(),
    service
      .from("exam_prep_podcasts")
      .select("id, topic_key, topic_label, title, chapters, created_at")
      .eq("id", input.podcastId)
      .eq("exam_prep_id", input.prepId)
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);
  if (prepRead.error || podcastRead.error) return { ok: false, code: "audio_unavailable" };
  const row = podcastRead.data as PodcastRow | null;
  if (!prepRead.data || !row) return { ok: false, code: "not_found" };

  const variants = speechVariants(row.chapters);
  if (!variants.length) return { ok: false, code: "not_cached" };
  let unavailable = false;
  for (const variant of variants) {
    const audio = await cachedAudioOnly(service, variant.speech);
    if (!audio.ok) {
      if (audio.reason === "audio_unavailable") unavailable = true;
      continue;
    }
    const topicLabel = (row.topic_label ?? "").trim();
    return {
      ok: true,
      item: { id: row.id, title: (row.title ?? "").trim() || topicLabel || "Podcast", topicLabel },
      lines: variant.lines.map((line, index) => ({ ...line, url: audio.tracks[index]!.url, durationMs: audio.tracks[index]!.durationMs })),
    };
  }
  return { ok: false, code: unavailable ? "audio_unavailable" : "not_cached" };
}
