import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { applyPreferencePatch, preferencePatchSchema, publicPreferences } from "@/lib/notifications/preference-api";
import { loadNotificationPreferences, preferencesByToken } from "@/lib/notifications/preferences";
import { INVALID_PREFERENCE_LINK } from "@/lib/notifications/preference-copy";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1).max(128), patch: preferencePatchSchema }).strict();

/**
 * E-postadaki bağlantının açtığı tercih sayfasının düğmeleri (Faz 6, 20 Kasım 2026). Oturum gerekmez: anahtar
 * (`user_notification_preferences.unsubscribe_token`, 256 bit) hesabı belirler ve yalnız o hesabın tercihini değiştirir.
 * Sayfayı açmak (GET) hiçbir şeyi değiştirmez; değişiklik yalnız bu uca düğmeyle gönderilir. Sınır IP başına.
 * Geçersiz anahtar 404 döner ve başka hiçbir şey söylemez.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, {
    scope: "notification-prefs-token",
    limit: 30,
    signal: "token_bruteforce",
    severity: "medium",
  });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const service = createServiceClient();
  const owner = await preferencesByToken(service, parsed.data.token);
  if (!owner) return NextResponse.json({ ok: false, error: INVALID_PREFERENCE_LINK }, { status: 404 });

  if (!(await applyPreferencePatch(service, owner.userId, parsed.data.patch))) return errorResponse(503, "save_failed");
  const preferences = await loadNotificationPreferences(service, owner.userId);
  return NextResponse.json(
    { ok: true, preferences: publicPreferences(preferences) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
