import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { awardStars } from "@/lib/stars/award";

const bodySchema = z.object({ videoId: z.string().uuid() });

/** "Dersi tamamla" (Astra): video bir kez tamamlanmış sayılır ve yıldız verir. */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-video-complete", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: video } = await service
    .from("prep_videos")
    .select("id, user_id, completed_at")
    .eq("id", parsed.data.videoId)
    .maybeSingle();
  if (!video || video.user_id !== userId) return errorResponse(404, "not_found");
  if (!video.completed_at) {
    await service.from("prep_videos").update({ completed_at: new Date().toISOString() }).eq("id", video.id);
  }
  const stars = await awardStars(service, { userId, source: "prep", ref: `video:${video.id}`, amount: 15 });
  return NextResponse.json({ ok: true, stars });
}
