import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import { DEFAULT_PODCAST_LENGTH } from "@/lib/learning/podcast-formats";
import { POST as preparePrepPodcast } from "@/app/api/learning/exam-prep/podcast/route";

/**
 * Ders bitince "Şimdi dinle" (sesli tekrar).
 *
 * 30 Ekim 2026 (Paket I #9): canlı stres testinde bu uç dokuz denemenin dokuzunda "Sesli tekrar bu sefer gelmedi"
 * dedi; aynı konunun hazırlık podcast'i ise çalıştı. Bu uç ayrı bir hattı koşuyordu: kaynak sayfa vermeden (yalnız
 * dersin özeti), `maxDuration` olmadan, önbelleksiz ve hatasını yalnız konsola yazarak. Artık hazırlık podcast'inin
 * kendisi: aynı konu sayfaları + aynı ders, aynı önbellek (konunun podcast'i varsa anında, kredisiz), aynı hata
 * kaydı. İki giriş, tek üretim hattı.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
  clientRequestId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  const forwarded = new Request(new URL("/api/learning/exam-prep/podcast", request.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      prepId: parsed.data.prepId,
      topicId: parsed.data.topicId,
      length: DEFAULT_PODCAST_LENGTH,
      listeningCheck: false,
      ...(parsed.data.clientRequestId ? { clientRequestId: parsed.data.clientRequestId } : {}),
    }),
  });
  const response = await preparePrepPodcast(forwarded);
  if (!response.ok) return response;
  const data = (await response.json().catch(() => null)) as { title?: string; chapters?: unknown; reused?: boolean } | null;
  if (!data || !Array.isArray(data.chapters)) return errorResponse(502, "generation_failed");
  return NextResponse.json({ title: data.title, chapters: data.chapters, reused: data.reused === true });
}
