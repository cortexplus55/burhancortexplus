import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { applyPreferencePatch, preferencePatchSchema, publicPreferences } from "@/lib/notifications/preference-api";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";

export const dynamic = "force-dynamic";

/**
 * Bildirim ve e-posta tercihleri (Faz 6, 20 Kasım 2026): dört anahtar ve çalışma saati (18, 19, 20, 21 → 18:30,
 * 19:00, 20:00, 21:00). Kampanya izni burada değil (`/api/profile/email-preferences`, yasal onay kanıtıyla).
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "notification-prefs-read", limit: 30 });
  if (!guard.ok) return guard.response;
  const preferences = await loadNotificationPreferences(guard.ctx.service, guard.ctx.userId);
  return NextResponse.json(
    { ok: true, preferences: publicPreferences(preferences) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "notification-prefs", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = preferencePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  if (!(await applyPreferencePatch(service, userId, parsed.data))) return errorResponse(503, "save_failed");
  const preferences = await loadNotificationPreferences(service, userId);
  return NextResponse.json(
    { ok: true, preferences: publicPreferences(preferences) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
