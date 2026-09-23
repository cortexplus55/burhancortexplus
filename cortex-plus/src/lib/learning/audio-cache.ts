import "server-only";
import { createHash } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/server";
import { audioHash, synthesizeLine } from "@/lib/ai/speech";
import type { SpeakerId } from "@/lib/learning/podcast-script";
import { env } from "@/lib/env";
import {
  commitCredits,
  recordUsage,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";

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

type Service = ReturnType<typeof createServiceClient>;

export type AudioRequest = { text: string; speaker: SpeakerId };
export type AudioTrack = { url: string; durationMs: number };

/**
 * Bir kredi kaç karakter seslendirme alıyor.
 *
 * Fiyat tablosundaki çevrimden geliyor (`ai_model_prices`): seslendirme
 * 1.000 karakter başına 0,0167 USD ve ~900 karakter bir dakika konuşma
 * ediyor. Yani 1 kredi ≈ 1 dakika ses ≈ 0,015 USD maliyet. Bu, sistemdeki
 * en ince marjlı kalem ve öyle olması normal: seslendirme gerçekten pahalı
 * bir iş. Önbellek paylaşımlı olduğu için pratikte çok daha iyi çalışıyor —
 * aynı cümleyi ikinci kez isteyen hiçbir şey ödemiyor.
 */
export const AUDIO_CHARS_PER_CREDIT = 900;

/**
 * Bu istekte GERÇEKTEN üretilecek karakter sayısı.
 *
 * Ücretlendirmeden önce sorulması gereken soru bu: önbellekten gelen cümlenin
 * bize maliyeti yok, dolayısıyla öğrenciden de para alınmamalı. Aynı cümle
 * listede iki kez geçiyorsa bir kez sayılıyor — `ensureAudio` de bir kez
 * üretiyor, ikisi aynı mantığı kullanmazsa öğrenci üretilmeyen sese öder.
 *
 * Önbellek sorgusu burada bir kez daha çalışıyor (üretimde bir daha). Tek
 * indeksli bir `IN` sorgusu; iki turu birleştirmek için akışı karmaşıklaştırmak
 * para yolunda okunabilirlikten çalmak olurdu.
 */
export async function countNewAudioChars(
  service: Service,
  lines: AudioRequest[],
): Promise<number> {
  if (!lines.length) return 0;

  const hashes = lines.map((line) => audioHash(line.text, line.speaker));
  const { data, error } = await service
    .from("lesson_audio")
    .select("hash")
    .in("hash", [...new Set(hashes)]);
  if (error) throw new Error("audio_cache_read_failed");

  const cached = new Set((data ?? []).map((row) => row.hash as string));
  const counted = new Set<string>();
  let chars = 0;

  for (const [index, line] of lines.entries()) {
    const hash = hashes[index];
    if (cached.has(hash) || counted.has(hash)) continue;
    counted.add(hash);
    chars += line.text.length;
  }

  return chars;
}

/** Karakter sayısını krediye çevirir; bir karakter bile varsa en az 1 kredi. */
export function audioCreditUnits(newChars: number): number {
  return newChars <= 0 ? 0 : Math.ceil(newChars / AUDIO_CHARS_PER_CREDIT);
}

/**
 * Ayırma anahtarı — istenen satırların tamamından türüyor, üretilecek
 * olanlardan değil.
 *
 * Sebebi zamanlama. Öğrenci "dinle"ye iki kez basarsa iki istek yan yana
 * çalışır; ikincisi geldiğinde birincinin yazdığı satırlar önbellekte olabilir
 * de olmayabilir de. Anahtar "yeni" satırlardan türeseydi iki istek farklı
 * anahtar üretir ve aynı ses iki kez faturalanırdı. İstenen listeden türeyen
 * anahtar her iki istekte de aynı: `credit_reserve` ikincisine birincinin
 * ayırmasını döndürür, öğrenci bir kez öder.
 *
 * Bilinen ödünü: bir üretim başarısız olup iade edildikten sonra aynı içerik
 * yeniden istenirse anahtar da aynı olur, `credit_reserve` iade edilmiş
 * ayırmayı döndürür ve o tek deneme ücretsiz geçer. Başarısızlık başına bir
 * ücretsiz üretimle sınırlı; aynı isteği iki kez faturalandırmaktansa bu
 * tarafa düşmeyi seçiyoruz.
 */
export function audioIdempotencyKey(
  userId: string,
  lines: AudioRequest[],
): string {
  const digest = createHash("sha256")
    .update(userId)
    .update("|")
    .update(lines.map((line) => audioHash(line.text, line.speaker)).join(","))
    .digest("hex");
  return `audio_${digest}`;
}

/**
 * İstenen cümlelerin sesini döndürür. Bir tanesi bile üretilemezse null:
 * yarım bir zaman çizelgesi göndermek, vurgunun sesin gerisinde kalması
 * demek olurdu.
 *
 * Dışa AÇILMIYOR. Bu fonksiyon ücret almadan ses üretiyor; dışarıdan
 * çağrılabildiği sürece bir uç, farkında olmadan seslendirmeyi bedavaya
 * çevirebilir. Dışarıya açık olan tek yol `synthesizeCharged`.
 */
async function ensureAudio(
  service: Service,
  lines: AudioRequest[],
  /**
   * Verildiginde seslendirme harcamasi bu kullaniciya yaziliyor.
   *
   * Yalnizca GERCEKTEN uretilen satirlar kaydediliyor: onbellek paylasimli ve
   * icerik adresli, onbellekten gelen cumlenin bize maliyeti yok. Kaydi
   * sisirmek marj hesabini yanlis gosterirdi.
   */
  userId?: string,
): Promise<AudioTrack[] | null> {
  if (!lines.length) return null;

  const hashes = lines.map((line) => audioHash(line.text, line.speaker));
  const unique = [...new Set(hashes)];

  const { data: cachedRows, error: cacheError } = await service
    .from("lesson_audio")
    .select("hash, storage_path, duration_ms")
    .in("hash", unique);
  if (cacheError) return null;

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

  // One reservation covers the whole script. Bound provider concurrency without
  // splitting billing into separately charged client requests.
  for (let offset = 0; offset < missing.length; offset += 8) {
    const produced = await Promise.all(
      missing.slice(offset, offset + 8).map(async ({ line, hash }) => {
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
          chars: result.chars,
        };
      }),
    );

    const rows = produced.filter((row) => row !== null);
    if (rows.length) {
      const { error: writeError } = await service.from("lesson_audio").upsert(
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
      if (writeError) return null;
      for (const row of rows) {
        cache.set(row.hash, { path: row.path, durationMs: row.durationMs });
      }

      if (userId) {
        // Tek olay, uretilen karakterlerin toplami. Sesin maliyeti bugune
        // kadar hicbir yere yazilmiyordu; marji belirleyen kalem olcusuz
        // duruyordu.
        void recordUsage(service, {
          userId,
          actionCode: "TTS_SYNTHESIZE",
          model: env.OPENAI_TTS_MODEL,
          tokensIn: rows.reduce((sum, row) => sum + row.chars, 0),
          tokensOut: 0,
        });
      }
    }
    if (rows.length !== produced.length) return null;
  }

  const resolved = hashes.map((hash) => cache.get(hash));
  if (resolved.some((entry) => !entry || !Number.isFinite(entry.durationMs) || entry.durationMs <= 0)) return null;

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

export type ChargedAudio =
  | { ok: true; tracks: AudioTrack[]; creditsSpent: number }
  | { ok: false; reason: "insufficient_credits" | "audio_unavailable" };

/**
 * Ses üretiminin ücretli yolu — her iki ses ucu da buradan geçiyor.
 *
 * Tek yerde durmasının sebebi, sıranın kendisinin kural olması: önce
 * gerçekten üretilecek karakter sayılır, sonra kredi AYRILIR, sonra üretim
 * denenir. Üretim başarısızsa ayrılan kredi iade edilir — öğrenci
 * dinleyemediği sese ödemez. İki uç bu sırayı ayrı ayrı yazsaydı biri er
 * geç diğerinden ayrışırdı ve ayrışma para yolunda olurdu.
 *
 * Her şey önbellekten geliyorsa (`units === 0`) hiç ayırma yapılmıyor:
 * bize maliyeti olmayan iş için cüzdana dokunmak yanlış olurdu.
 */
export async function synthesizeCharged(
  service: Service,
  userId: string,
  lines: AudioRequest[],
): Promise<ChargedAudio> {
  let units: number;
  try {
    units = audioCreditUnits(await countNewAudioChars(service, lines));
  } catch {
    return { ok: false, reason: "audio_unavailable" };
  }

  let reservationId: string | null = null;
  if (units > 0) {
    const reservation = await reserveCredits(
      service,
      userId,
      "AUDIO_SYNTHESIZE",
      audioIdempotencyKey(userId, lines),
      units,
    );
    // `invalid_action` ve `error` da buraya düşüyor. İkisi de bizim
    // tarafımızın arızası; öğrenciye ücretsiz ses vermektense isteği
    // reddetmek doğru — sessizce bedavaya geçen bir yol, ölçmediğimiz bir
    // maliyet demek.
    if (!reservation.ok) return {
      ok: false,
      reason: reservation.reason === "insufficient_credits" ? "insufficient_credits" : "audio_unavailable",
    };
    reservationId = reservation.reservationId;
  }

  let tracks: AudioTrack[] | null;
  try {
    tracks = await ensureAudio(service, lines, userId);
  } catch {
    // Network exceptions must release the same reservation as ordinary failures.
    tracks = null;
  }

  if (!tracks) {
    if (reservationId) await refundCredits(service, reservationId);
    return { ok: false, reason: "audio_unavailable" };
  }

  if (reservationId) await commitCredits(service, reservationId);
  return { ok: true, tracks, creditsSpent: units };
}
