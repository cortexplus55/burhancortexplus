import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { confirmDeletionByToken } from "@/lib/privacy/public-deletion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ token: z.string().trim().min(10).max(400) });

const MESSAGES = {
  invalid: "Bu bağlantı geçersiz. Hesap silme sayfasından yeni bir bağlantı iste.",
  expired: "Bağlantının süresi doldu. Hesap silme sayfasından yeni bir bağlantı iste.",
  unconfigured: "Silme şu an başlatılamadı. Biraz sonra yeniden dene ya da bize yaz.",
  already_deleted: "Bu hesap zaten silinmiş.",
} as const;

/**
 * E-postadaki bağlantıyla hesap silme onayı (26 Kasım 2026). Yalnız POST siler (bağlantıyı önceden açan e-posta
 * istemcisi bir şey silmez); belirteç imzalı ve süreli. IP başına 10 dakikada 10.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, { scope: "account-delete-confirm", limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: MESSAGES.invalid }, { status: 400 });

  const outcome = await confirmDeletionByToken(createServiceClient(), parsed.data.token).catch(() => null);
  if (!outcome) return NextResponse.json({ ok: false, error: MESSAGES.unconfigured }, { status: 503 });
  if (!outcome.ok) {
    const status = outcome.reason === "already_deleted" ? 409 : outcome.reason === "unconfigured" ? 503 : 400;
    return NextResponse.json({ ok: false, reason: outcome.reason, error: MESSAGES[outcome.reason] }, { status });
  }
  return NextResponse.json({ ok: true, status: outcome.status }, { headers: { "Cache-Control": "no-store" } });
}
