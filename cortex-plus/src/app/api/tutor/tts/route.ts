import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { synthesizeCharged } from "@/lib/learning/audio-cache";
import { tutorSpeechLines, TUTOR_TTS_MAX_INPUT } from "@/lib/speech/tutor-speech-lines";

/**
 * Öğretmen sohbetinin sesi (öğretmen v3, 21 Kasım 2026): yanıtın altındaki 🔊 ve "Yanıtları sesli oku" buradan çalar.
 * Tarayıcının robot sesi kullanılmaz. Metin önce akademik seslendirme motorundan geçer (kök, üs, iyon, birim, madde,
 * Roma rakamı Türkçe okunur), cümlelere bölünür ve OpenAI TTS ile öğretmen üslubunda ("marin") seslendirilir.
 *
 * Bedel ses uçlarının ortak kuralıyla (`synthesizeCharged`): yalnız gerçekten üretilen karakter ücretlenir; aynı cümle
 * önbellekten gelir ve ücretsizdir (aynı yanıtı yeniden dinlemek bedava). Ücretsiz hesapta ses Plus'ta
 * (`PLUS_ONLY_ACTIONS`); ret 402 `premium_required`.
 */

export const maxDuration = 60;

const bodySchema = z.object({ text: z.string().min(1).max(TUTOR_TTS_MAX_INPUT) });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "tutor-tts", limit: 40 });
  if (!guard.ok) return guard.response;

  const entitlements = await getUserEntitlements(guard.ctx.service, guard.ctx.userId);
  if (!requireFeature(entitlements, "speech")) return errorResponse(402, "premium_required");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const lines = tutorSpeechLines(parsed.data.text);
  if (!lines.length) return errorResponse(400, "invalid_input");

  const result = await synthesizeCharged(
    guard.ctx.service,
    guard.ctx.userId,
    lines.map((text) => ({ text, speaker: "ada" as const, style: "tutor" as const })),
  );
  if (!result.ok && (result.reason === "insufficient_credits" || result.reason === "premium_required")) {
    return errorResponse(402, result.reason);
  }
  if (!result.ok) return errorResponse(503, "audio_unavailable");

  return NextResponse.json({
    creditsSpent: result.creditsSpent,
    parts: result.tracks.map((track) => ({ url: track.url, durationMs: track.durationMs })),
  });
}
