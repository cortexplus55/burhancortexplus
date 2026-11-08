import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPasswordReset } from "@/lib/auth/password-reset";
import { appOrigin } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * Şifre sıfırlama (8 Kasım 2026): bağlantı bizim posta hattımızdan gider. IP başına 10 dakikada 5, adres başına saatte
 * 3. Cevap her zaman aynı (`{ ok: true }`): kayıtlı adresler dışarıdan sınanamasın. Gönderim düşerse günlüğe yazılır.
 */
export async function POST(request: Request) {
  const ipLimited = await guestLimit(request, { scope: "password-reset-ip", limit: 5, windowSeconds: 600 });
  if (ipLimited) return ipLimited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi yaz." }, { status: 400 });
  const email = parsed.data.email;
  const perAddress = await guestLimit(request, {
    scope: "password-reset-email",
    limit: 3,
    windowSeconds: 3_600,
    subject: email,
  });
  if (perAddress) return perAddress;

  // Her iç hata yutulur ve günlüğe yazılır: servis anahtarı yok, bağlantı üretilemedi, e-posta gitmedi. Cevap yine
  // aynı kalır ("hesap varsa gönderdik"); aksi hâlde hata ekranı hesabın var olup olmadığını ele verirdi.
  let outcome: Awaited<ReturnType<typeof sendPasswordReset>> | "link_failed" = "link_failed";
  try {
    outcome = await sendPasswordReset(createServiceClient(), email, appOrigin());
  } catch {
    outcome = "link_failed";
  }
  if (outcome === "send_failed" || outcome === "link_failed") {
    console.error("password_reset_failed", { outcome });
  }
  return NextResponse.json({ ok: true });
}
