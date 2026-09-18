import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { synthesizeCharged } from "@/lib/learning/audio-cache";
import { splitSentences, SPEAKERS } from "@/lib/learning/podcast-script";

/**
 * Tek konuşma parçasını seslendirir — sözlü sınavda eğitmenin sesi buradan
 * geliyor. Podcast ile aynı önbelleği kullanıyor, bu yüzden tekrar eden
 * kalıplar ("Güzel, devam edelim.") ikinci kez üretilmiyor.
 *
 * Podcast ile aynı ücretlendirmeden geçiyor: yalnızca gerçekten üretilen
 * karakter faturalanıyor (900 karakter = 1 kredi). Sözlü sınavda tekrar eden
 * kalıplar zaten önbellekte olduğu için pratikte çoğu cümle bedava geliyor.
 */

const MAX_SENTENCES = 12;

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
  speaker: z.enum(SPEAKERS).default("ada"),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "speech", limit: 60 });
  if (!guard.ok) return guard.response;

  // Sunucu sesi premium. Ucretsiz kullanici tarayici sesiyle devam ediyor.
  if (!(await isPremiumUser(guard.ctx.service, guard.ctx.userId))) {
    return errorResponse(402, "premium_required");
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const sentences = splitSentences(parsed.data.text).slice(0, MAX_SENTENCES);
  if (!sentences.length) return errorResponse(400, "invalid_input");

  const result = await synthesizeCharged(
    guard.ctx.service,
    guard.ctx.userId,
    sentences.map((text) => ({ text, speaker: parsed.data.speaker })),
  );
  if (!result.ok && result.reason === "insufficient_credits") {
    return errorResponse(402, "insufficient_credits");
  }
  if (!result.ok) return errorResponse(503, "audio_unavailable");

  return NextResponse.json({
    creditsSpent: result.creditsSpent,
    parts: result.tracks.map((track, i) => ({
      text: sentences[i],
      url: track.url,
      durationMs: track.durationMs,
    })),
  });
}
