import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { findAuthUserByEmail, GOOGLE_ONLY_NOTE, isGoogleOnly } from "@/lib/auth/find-user";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * Giriş ipucu (8 Kasım 2026): e-posta ve şifreyle girişi reddedilen öğrenciye YALNIZ bir durumda yol gösterir:
 * hesap Google ile açılmış ve şifresi yok. Başka her durumda (kayıtsız adres, yanlış şifre) cevap aynıdır
 * ({ hint: null }). Kayıtlı bir adresin "Google ile açılmış" olduğu böylece dışarıdan öğrenilebilir; Notion ve Canva
 * gibi ürünlerin kabul ettiği bu bedel, öğrencinin neden giremediğini bilmesinden daha küçük görüldü. Sıkı sınır:
 * IP başına 10 dakikada 10, adres başına saatte 5.
 */
export async function POST(request: Request) {
  const ipLimited = await guestLimit(request, { scope: "login-hint-ip", limit: 10, windowSeconds: 600 });
  if (ipLimited) return ipLimited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ hint: null });
  const perAddress = await guestLimit(request, {
    scope: "login-hint-email",
    limit: 5,
    windowSeconds: 3_600,
    subject: parsed.data.email,
  });
  if (perAddress) return perAddress;
  const user = await findAuthUserByEmail(createServiceClient(), parsed.data.email).catch(() => null);
  return NextResponse.json({ hint: isGoogleOnly(user) ? GOOGLE_ONLY_NOTE : null });
}
