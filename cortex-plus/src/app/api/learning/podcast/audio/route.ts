import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { ensureAudio } from "@/lib/learning/audio-cache";
import { flattenLines, normalizeChapters } from "@/lib/learning/podcast-script";

/**
 * Podcast seslendirme.
 *
 * Ses premium özelliği. Ölçüm bunu zorunlu kıldı: bir podcast'in maliyetinin
 * %98,4'ü seslendirme ve günlük bütçesini hep podcasta harcayan bir ücretsiz
 * kullanıcı hiç ödeme yapmadan ayda 108 TL'ye mal oluyordu.
 *
 * Ücretsiz kullanıcı senaryoyu okumaya ve cihazının sesiyle dinlemeye devam
 * ediyor — oynatıcı bu yanıtı alamayınca tarayıcı sesine düşüyor.
 *
 * Premium tarafta ses düğümün bedeline dahil; ayrıca kredi yakmıyor. Bunu
 * ayakta tutan şey önbellek — aynı cümle bir daha üretilmiyor.
 */

/** Tek istekte üretilecek en fazla cümle; kaçak bir senaryo faturayı şişirmesin. */
const MAX_LINES = 60;

const bodySchema = z.object({
  chapters: z.array(z.unknown()).min(1).max(8),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast-audio", limit: 12 });
  if (!guard.ok) return guard.response;

  if (!(await isPremiumUser(guard.ctx.service, guard.ctx.userId))) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const chapters = normalizeChapters(parsed.data.chapters);
  if (!chapters.length) return errorResponse(400, "invalid_input");

  const lines = flattenLines(chapters).slice(0, MAX_LINES);
  const tracks = await ensureAudio(
    guard.ctx.service,
    lines.map((line) => ({ text: line.text, speaker: line.speaker })),
  );

  // Bir cümle bile üretilemediyse açıkça başarısız oluyoruz; istemci
  // tarayıcı sesine döner, yarım bir zaman çizelgesiyle çalışmaz.
  if (!tracks) return errorResponse(503, "audio_unavailable");

  return NextResponse.json({
    lines: lines.map((line, i) => ({
      chapterIndex: line.chapterIndex,
      speaker: line.speaker,
      text: line.text,
      url: tracks[i].url,
      durationMs: tracks[i].durationMs,
    })),
  });
}
