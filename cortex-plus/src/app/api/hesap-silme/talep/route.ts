import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit } from "@/lib/api/guards";
import { appOrigin } from "@/lib/app-url";
import { createServiceClient } from "@/lib/supabase/server";
import { requestDeletionByEmail } from "@/lib/privacy/public-deletion";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * Giriş yapmadan hesap silme talebi (26 Kasım 2026, Google Play). Hesap varsa adrese imzalı onay bağlantısı gider. IP
 * başına 10 dakikada 5, adres başına saatte 3. Cevap her zaman aynı (`{ ok: true }`): kayıtlı adresler dışarıdan
 * sınanamasın. İç hata yutulur, günlüğe yazılır.
 */
export async function POST(request: Request) {
  const ipLimited = await guestLimit(request, { scope: "account-delete-ip", limit: 5, windowSeconds: 600 });
  if (ipLimited) return ipLimited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi yaz." }, { status: 400 });
  }
  const email = parsed.data.email;
  const perAddress = await guestLimit(request, {
    scope: "account-delete-email",
    limit: 3,
    windowSeconds: 3_600,
    subject: email,
  });
  if (perAddress) return perAddress;

  try {
    const outcome = await requestDeletionByEmail(createServiceClient(), email, appOrigin());
    if (outcome === "send_failed" || outcome === "unconfigured") console.error("account_delete_request_failed", { outcome });
  } catch {
    console.error("account_delete_request_failed", { outcome: "exception" });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
