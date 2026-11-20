import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { radioEpisodeAudio } from "@/lib/learning/prep-radio-server";

/**
 * Sınav Radyosu sesi (Faz 7, 20 Kasım 2026): hazırlığın kayıtlı bir bölümünün satır sesleri, YALNIZ ÖNBELLEKTEN.
 * Hiçbir planda seslendirme yapılmaz, kredi ayrılmaz, kullanım yazılmaz (ücretsiz hesap da dinler; önbellekten ses
 * bize maliyetsiz). Satırlardan biri bile önbellekte yoksa 409 `not_cached`: radyo o bölümü atlar. Bölüm istemciden
 * değil kayıttan okunur (öğrencinin hazırlığı ve bölümü; başka öğrencinin kimliği 404).
 */

const bodySchema = z.object({
  prepId: z.string().uuid(),
  podcastId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-radio", limit: 30, dailyLimit: 900 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const episode = await radioEpisodeAudio(service, { ...parsed.data, userId });
  if (!episode.ok) {
    if (episode.code === "not_found") return errorResponse(404, "not_found");
    if (episode.code === "not_cached") {
      return NextResponse.json(
        { error: "Bu bölümün sesi henüz hazır değil; radyo onu atlar.", code: "not_cached" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Ses şu an açılamadı. Birazdan yeniden dene.", code: "audio_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, item: episode.item, lines: episode.lines, creditsSpent: 0 });
}
