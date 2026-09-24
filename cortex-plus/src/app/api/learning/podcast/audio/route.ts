import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { synthesizeCharged } from "@/lib/learning/audio-cache";
import { flattenLines, normalizeChapters } from "@/lib/learning/podcast-script";
import { MAX_PODCAST_AUDIO_CHARS, MAX_PODCAST_AUDIO_LINES, MAX_SPEECH_LINE_CHARS } from "@/lib/learning/podcast-audio-contract";

export const maxDuration = 300;

/**
 * Podcast seslendirme.
 *
 * Kayıtlı her kademe bu ucu çağırabilir. Harcama özellik kilidi değil:
 * yalnızca gerçekten üretilen karakter faturalanıyor (900 karakter = 1 kredi);
 * önbellekten gelen cümle bedava, çünkü bize de bir maliyeti yok. Hak bitince
 * 402 `insufficient_credits`. Misafir `withUser` ile 401 alır.
 */

/** Tek istekte üretilecek en fazla cümle; kaçak bir senaryo faturayı şişirmesin. */

const bodySchema = z.object({
  chapters: z.array(z.unknown()).min(1).max(8),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "podcast-audio", limit: 12 });
  if (!guard.ok) return guard.response;

  const entitlements = await getUserEntitlements(guard.ctx.service, guard.ctx.userId);
  if (!requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const chapters = normalizeChapters(parsed.data.chapters);
  if (!chapters.length) return errorResponse(400, "invalid_input");

  const lines = flattenLines(chapters);
  if (lines.length > MAX_PODCAST_AUDIO_LINES ||
      lines.some((line) => line.text.length > MAX_SPEECH_LINE_CHARS) ||
      lines.reduce((sum, line) => sum + line.text.length, 0) > MAX_PODCAST_AUDIO_CHARS) {
    return errorResponse(400, "invalid_input");
  }
  const result = await synthesizeCharged(
    guard.ctx.service,
    guard.ctx.userId,
    lines.map((line) => ({ text: line.text, speaker: line.speaker })),
  );

  // Kredisi yetmeyen öğrenci senaryoyu okumaya ve tarayıcı sesiyle
  // dinlemeye devam ediyor; oynatıcı 402'yi de 503 gibi karşılıyor.
  if (!result.ok && result.reason === "insufficient_credits") {
    return errorResponse(402, "insufficient_credits");
  }

  // Bir cümle bile üretilemediyse açıkça başarısız oluyoruz; istemci
  // tarayıcı sesine döner, yarım bir zaman çizelgesiyle çalışmaz.
  if (!result.ok) return errorResponse(503, "audio_unavailable");

  return NextResponse.json({
    creditsSpent: result.creditsSpent,
    lines: lines.map((line, i) => ({
      chapterIndex: line.chapterIndex,
      speaker: line.speaker,
      text: line.text,
      url: result.tracks[i].url,
      durationMs: result.tracks[i].durationMs,
    })),
  });
}
