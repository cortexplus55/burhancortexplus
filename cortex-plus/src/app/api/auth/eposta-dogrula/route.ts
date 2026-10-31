import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { guestLimit } from "@/lib/api/guards";
import { markEmailVerified, readEmailToken, tokenMatchesEmail } from "@/lib/auth/email-verification";

export const dynamic = "force-dynamic";

/**
 * Doğrulama bağlantısı (31 Ekim 2026, Paket J1 #1): imza ve süre tutarsa ve hesabın e-postası bağlantının
 * yazıldığı adresse `email_unverified` bayrağı kalkar; öğrenci ana sayfaya "doğrulandı" notuyla döner. Oturum
 * gerekmez (bağlantı e-posta uygulamasında, başka tarayıcıda açılabilir). Bozuk ya da süresi geçmiş bağlantı
 * öğrenciyi yeni bağlantı isteyebileceği yere götürür.
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const limited = await guestLimit(request, { scope: "email-verify", limit: 30 });
  if (limited) return limited;

  const token = readEmailToken(searchParams.get("t"));
  if (!token) return NextResponse.redirect(`${origin}/dashboard?eposta=gecersiz`);

  const service = createServiceClient();
  const { data } = await service.auth.admin.getUserById(token.userId);
  const email = data.user?.email ?? "";
  if (!email || !tokenMatchesEmail(token, email)) {
    return NextResponse.redirect(`${origin}/dashboard?eposta=gecersiz`);
  }
  const ok = await markEmailVerified(service, token.userId);
  return NextResponse.redirect(`${origin}/dashboard?eposta=${ok ? "dogrulandi" : "gecersiz"}`);
}
