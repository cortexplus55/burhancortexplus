import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";
import { audioHash, synthesizeLine } from "@/lib/ai/speech";
import type { SpeakerId } from "@/lib/learning/podcast-script";

/**
 * Ses önbelleği.
 *
 * Anahtar içerik: cümle metni + konuşmacı + model. Aynı cümle bir daha
 * üretilmiyor; okul akışında forklanan hazırlıklar aynı konuları işlediği
 * için tekrar üretimin büyük kısmı burada kesiliyor.
 *
 * Tablo istemciye kapalı (RLS açık, politika yok) — buraya yalnız service
 * role giriyor ve dışarıya sadece kısa ömürlü imzalı URL çıkıyor.
 */

export const AUDIO_BUCKET = "lesson-audio";
const SIGNED_URL_SECONDS = 60 * 60;

export type AudioRequest = { text: string; speaker: SpeakerId };
export type AudioTrack = { url: string; durationMs: number };

type Service = ReturnType<typeof createServiceClient>;

/**
 * İstenen cümlelerin sesini döndürür. Bir tanesi bile üretilemezse null:
 * yarım bir zaman çizelgesi göndermek, vurgunun sesin gerisinde kalması
 * demek olurdu.
 */
export async function ensureAudio(
  service: Service,
  lines: AudioRequest[],
): Promise<AudioTrack[] | null> {
  if (!lines.length) return null;

  const hashes = lines.map((line) => audioHash(line.text, line.speaker));
  const unique = [...new Set(hashes)];

  const { data: cachedRows } = await service
    .from("lesson_audio")
    .select("hash, storage_path, duration_ms")
    .in("hash", unique);

  const cache = new Map<string, { path: string; durationMs: number }>();
  for (const row of cachedRows ?? []) {
    cache.set(row.hash as string, {
      path: row.storage_path as string,
      durationMs: row.duration_ms as number,
    });
  }

  const missing = lines
    .map((line, i) => ({ line, hash: hashes[i] }))
    .filter((item, i, all) => {
      if (cache.has(item.hash)) return false;
      // Aynı cümle listede iki kez geçiyorsa bir kez üret.
      return all.findIndex((other) => other.hash === item.hash) === i;
    });

  if (missing.length) {
    const produced = await Promise.all(
      missing.map(async ({ line, hash }) => {
        const result = await synthesizeLine(line.text, line.speaker);
        if (!result) return null;

        const path = `${hash.slice(0, 2)}/${hash}.mp3`;
        const { error } = await service.storage
          .from(AUDIO_BUCKET)
          .upload(path, result.audio, {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (error) return null;

        return {
          hash,
          path,
          durationMs: result.durationMs,
          speaker: line.speaker,
          chars: line.text.length,
        };
      }),
    );

    const rows = produced.filter((row) => row !== null);
    if (rows.length) {
      await service.from("lesson_audio").upsert(
        rows.map((row) => ({
          hash: row.hash,
          storage_path: row.path,
          duration_ms: row.durationMs,
          voice: row.speaker,
          chars: row.chars,
          last_used_at: new Date().toISOString(),
        })),
        { onConflict: "hash" },
      );
      for (const row of rows) {
        cache.set(row.hash, { path: row.path, durationMs: row.durationMs });
      }
    }
  }

  const resolved = hashes.map((hash) => cache.get(hash));
  if (resolved.some((entry) => !entry)) return null;

  const paths = [...new Set(resolved.map((entry) => entry!.path))];
  const { data: signed, error } = await service.storage
    .from(AUDIO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !signed) return null;

  const urlByPath = new Map<string, string>();
  signed.forEach((item, i) => {
    if (item.signedUrl) urlByPath.set(paths[i], item.signedUrl);
  });

  const tracks: AudioTrack[] = [];
  for (const entry of resolved) {
    const url = urlByPath.get(entry!.path);
    if (!url) return null;
    tracks.push({ url, durationMs: entry!.durationMs });
  }

  void service
    .from("lesson_audio")
    .update({ last_used_at: new Date().toISOString() })
    .in("hash", unique);

  return tracks;
}
