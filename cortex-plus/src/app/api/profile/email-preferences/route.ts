import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { loadEmailPreferences, setMarketingPreference, setReminderPreference } from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ marketing: z.boolean().optional(), reminders: z.boolean().optional() })
  .refine((value) => value.marketing !== undefined || value.reminders !== undefined);

/** E-posta tercihleri (7 Kasım 2026): çalışma hatırlatması (varsayılan açık) ve kampanya izni (varsayılan kapalı). */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "email-prefs-read", limit: 30 });
  if (!guard.ok) return guard.response;
  return NextResponse.json(await loadEmailPreferences(guard.ctx.service, guard.ctx.userId), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "email-prefs", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  if (parsed.data.reminders !== undefined && !(await setReminderPreference(service, userId, parsed.data.reminders))) {
    return errorResponse(503, "update_failed");
  }
  if (
    parsed.data.marketing !== undefined &&
    !(await setMarketingPreference(service, userId, parsed.data.marketing, {
      source: "settings",
      ip: request.headers.get("x-forwarded-for"),
    }))
  ) {
    return errorResponse(503, "update_failed");
  }
  return NextResponse.json({ ok: true, ...(await loadEmailPreferences(service, userId)) });
}
