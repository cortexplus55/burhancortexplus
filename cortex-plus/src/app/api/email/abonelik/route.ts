import { NextResponse } from "next/server";
import { guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { setMarketingPreference, setReminderPreference } from "@/lib/email/preferences";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

/**
 * E-postadaki "abonelikten çık" (7 Kasım 2026). İki kapı, tek iş:
 * - POST: posta uygulamasının tek tıkla düğmesi (RFC 8058, bağlantıdaki imzalı anahtarla) ve sayfadaki düğme.
 * - GET: yalnız sayfaya yönlendirir; bağlantıyı önceden tarayan güvenlik yazılımları ya da posta önizlemeleri
 *   öğrenciyi sessizce çıkarmasın diye GET hiçbir şeyi değiştirmez.
 * Oturum gerekmez: bağlantı hesapla eşleşir ve yalnız o hesabın o kategorisini kapatır.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, { scope: "email-unsub", limit: 30 });
  if (limited) return limited;

  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const body = (await request.json().catch(() => null)) as { t?: unknown } | null;
    token = typeof body?.t === "string" ? body.t : null;
  }
  const claims = verifyUnsubscribeToken(token);
  if (!claims) return NextResponse.json({ ok: false, error: "Bağlantı geçersiz." }, { status: 400 });

  const service = createServiceClient();
  const done =
    claims.category === "marketing"
      ? await setMarketingPreference(service, claims.userId, false, {
          source: "unsubscribe_link",
          ip: request.headers.get("x-forwarded-for"),
        })
      : await setReminderPreference(service, claims.userId, false);
  if (!done) return NextResponse.json({ ok: false, error: "Kaydedilemedi. Biraz sonra yeniden dene." }, { status: 503 });
  return NextResponse.json({ ok: true, category: claims.category });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/eposta/abonelik?t=${encodeURIComponent(token)}`, request.url), 303);
}
