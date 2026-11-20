import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { markNotificationsRead, unreadCount } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;

const bodySchema = z
  .object({
    ids: z.array(z.string().regex(ID)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.all === true || (body.ids?.length ?? 0) > 0, { message: "empty" });

/**
 * Okundu işaretle (Faz 6, 20 Kasım 2026): `{ ids }` verilen bildirimler, `{ all: true }` hepsi. Yalnız kullanıcının
 * kendi satırları; cevapta güncel okunmamış sayısı (çan rozeti onu yazar).
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "notifications-mark", limit: 60, dailyLimit: 3000 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const done = await markNotificationsRead(service, userId, parsed.data.all ? "all" : (parsed.data.ids ?? []));
  if (!done) return errorResponse(503, "save_failed");
  return NextResponse.json(
    { ok: true, unread: await unreadCount(service, userId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
