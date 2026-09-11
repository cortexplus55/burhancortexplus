import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const bodySchema = z.object({ enabled: z.boolean() });

/**
 * Hatırlatma e-postası açık mı kapalı mı.
 *
 * Kolon migration ile geliyor; gelmeden önce dağıtılırsa burası hata
 * verir ama başka hiçbir şey bozulmaz — gönderim zaten kolon yoksa
 * kapalı davranıyor.
 */
export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "study-reminder-pref", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { error } = await service
    .from("profiles")
    .update({ study_reminder_email: parsed.data.enabled })
    .eq("id", userId);

  if (error) return errorResponse(503, "update_failed");
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
