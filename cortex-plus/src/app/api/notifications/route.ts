import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { listInAppNotifications, unreadCount } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

/** En çok kaç bildirim döner; çan 20 ister. */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * Uygulama içi bildirimler (Faz 6, 20 Kasım 2026): `{ items, unread }`. `?limit=0` yalnız okunmamış sayısını
 * döndürür (`items` boş): çan rozeti açılışta ve sekme öne gelince bunu sorar, listeyi yalnız açılınca ister.
 * Okuma sunucu anahtarıyla ve kullanıcı süzgeciyle; tarayıcı tabloya doğrudan erişmez.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "notifications-read", limit: 30, dailyLimit: 3000 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const raw = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_LIMIT, Math.floor(raw))) : DEFAULT_LIMIT;
  const headers = { "Cache-Control": "no-store" };
  try {
    if (limit === 0) return NextResponse.json({ items: [], unread: await unreadCount(service, userId) }, { headers });
    return NextResponse.json(await listInAppNotifications(service, userId, { limit }), { headers });
  } catch (error) {
    console.error("notifications_list_failed", { error: String(error) });
    return errorResponse(503, "notifications_unavailable", { error: "Bildirimler şu an okunamadı. Biraz sonra yeniden dene." });
  }
}
