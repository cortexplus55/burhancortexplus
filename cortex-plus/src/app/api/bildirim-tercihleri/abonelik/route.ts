import { NextResponse } from "next/server";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { requestIp } from "@/lib/abuse/record";
import { unsubscribeCategory } from "@/lib/notifications/preference-api";
import { preferencesByToken } from "@/lib/notifications/preferences";
import { INVALID_PREFERENCE_LINK } from "@/lib/notifications/preference-copy";
import { isUnsubscribeCategory } from "@/lib/notifications/unsubscribe-links";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Tek tıkla abonelikten çıkış (RFC 8058, Faz 6, 20 Kasım 2026): `POST …?token=<anahtar>&c=<kategori>`. Posta
 * uygulamasının "abonelikten çık" düğmesi gövdeyi `List-Unsubscribe=One-Click` (form) olarak ya da boş gönderir;
 * gövde okunmaz, kategori ve anahtar adresten gelir. Yalnız istenen kategori kapanır; kampanya (`marketing`) yasal
 * kanıtıyla kendi tablosunda kapanır.
 *
 * GET hiçbir şeyi değiştirmez: posta uygulamaları ve güvenlik yazılımları bağlantıları önceden açar; öğrenci
 * sessizce çıkarılmasın diye GET yalnız tercih sayfasına yönlendirir.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, {
    scope: "notification-unsub",
    limit: 30,
    signal: "token_bruteforce",
    severity: "medium",
  });
  if (limited) return limited;

  // Gövde (boş ya da "List-Unsubscribe=One-Click") tüketilir ama kararı etkilemez.
  await request.text().catch(() => "");

  const url = new URL(request.url);
  const category = url.searchParams.get("c");
  if (!isUnsubscribeCategory(category)) return errorResponse(400, "invalid_input");

  const service = createServiceClient();
  const owner = await preferencesByToken(service, url.searchParams.get("token"));
  if (!owner) return NextResponse.json({ ok: false, error: INVALID_PREFERENCE_LINK }, { status: 404 });

  if (!(await unsubscribeCategory(service, owner.userId, category, requestIp(request)))) {
    return errorResponse(503, "save_failed");
  }
  return NextResponse.json({ ok: true, category }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(new URL(`/bildirim-tercihleri?token=${encodeURIComponent(token)}`, request.url), 303);
}
