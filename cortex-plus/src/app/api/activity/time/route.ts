import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { todayKey } from "@/lib/learning/daily-drill";
import { LEARNING_SURFACES } from "@/lib/learning/learning-time";

const bodySchema = z.object({
  seconds: z.number().int().min(1).max(120),
  surface: z.enum(LEARNING_SURFACES),
  subject: z.string().max(80).nullish(),
});

/**
 * Aktif öğrenme süresini ekler. İstemci 30 saniyede bir, sekme kapanırken
 * de `sendBeacon` ile çağırır. Tek çağrı en fazla 120 saniye; veritabanı
 * işlevi de aynı sınırı uyguluyor.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "learning-time", limit: 6, dailyLimit: 3000 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { error } = await service.rpc("add_learning_time", {
    p_user_id: userId,
    p_date: todayKey(),
    p_surface: parsed.data.surface,
    p_subject: (parsed.data.subject ?? "").trim().slice(0, 40),
    p_seconds: parsed.data.seconds,
  });
  if (error) return errorResponse(503, "save_failed");
  return new NextResponse(null, { status: 204 });
}
