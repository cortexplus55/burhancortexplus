import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { applyPreferencePatch } from "@/lib/notifications/preference-api";

const bodySchema = z.object({ enabled: z.boolean() });

/**
 * Hatırlatma e-postası açık mı kapalı mı (eski uç; Ayarlar artık `/api/notification-preferences`'ı kullanır).
 *
 * Faz 6 (20 Kasım 2026): yazım yeni tercih deposundan geçer (`saveNotificationPreferences`); tablo henüz yoksa depo
 * eski sütuna (`profiles.study_reminder_email`) yazar.
 */
export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "study-reminder-pref", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  if (!(await applyPreferencePatch(service, userId, { studyRemindersEmail: parsed.data.enabled }))) {
    return errorResponse(503, "save_failed");
  }
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
