import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { mp3DurationMs } from "@/lib/audio/mp3-duration";
import type { SpeakerId } from "@/lib/learning/podcast-script";

/**
 * Sunucu tarafı ses: podcast için seslendirme, sözlü sınav için çözümleme.
 *
 * Seslendirme cümle başına yapılıyor. Sebebi senkron: her cümlenin süresi
 * kendi dosyasından ölçülüyor, böylece transkript vurgusu tahmine değil
 * gerçek süreye dayanıyor.
 */

const VOICE: Record<SpeakerId, string> = {
  ada: "nova",
  kerem: "onyx",
};

const SPEAKER_STYLE: Record<SpeakerId, string> = {
  ada: "Sıcak, meraklı ve anlaşılır bir öğretmen tonu. Doğal hızda konuş.",
  kerem: "Sakin, açıklayıcı ve arkadaşça bir ton. Doğal hızda konuş.",
};

export function voiceFor(speaker: SpeakerId): string {
  return VOICE[speaker] ?? VOICE.ada;
}

/**
 * Önbellek anahtarı. Modeli ve sesi de içeriyor: model değişirse eski ses
 * sessizce servis edilmesin, yeniden üretilsin.
 */
export function audioHash(text: string, speaker: SpeakerId): string {
  return createHash("sha256")
    .update(`${env.OPENAI_TTS_MODEL}|${voiceFor(speaker)}|${text.trim()}`)
    .digest("hex");
}

export type SynthResult = { audio: Buffer; durationMs: number };

export async function synthesizeLine(
  text: string,
  speaker: SpeakerId,
): Promise<SynthResult | null> {
  if (!env.OPENAI_API_KEY) return null;
  const clean = text.trim();
  if (!clean) return null;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await openai.audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: voiceFor(speaker),
      input: clean.slice(0, 1200),
      instructions: SPEAKER_STYLE[speaker],
      response_format: "mp3",
    });

    const audio = Buffer.from(await response.arrayBuffer());
    const durationMs = mp3DurationMs(audio);
    // Süre ölçülemediyse bu parçayı önbelleğe almıyoruz: sıfır süreli bir
    // satır zaman çizelgesini kaydırır ve vurgu sesin gerisinde kalır.
    if (!durationMs) return null;
    return { audio, durationMs };
  } catch {
    return null;
  }
}

export async function transcribeAudio(file: File): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const result = await openai.audio.transcriptions.create({
      model: env.OPENAI_STT_MODEL,
      file,
      language: "tr",
    });
    const text = (result as { text?: string }).text?.trim() ?? "";
    return text || null;
  } catch {
    return null;
  }
}
