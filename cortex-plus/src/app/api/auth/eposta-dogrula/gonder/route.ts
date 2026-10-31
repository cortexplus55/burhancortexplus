import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isEmailUnverified, sendVerification } from "@/lib/auth/email-verification";

export const dynamic = "force-dynamic";

/**
 * "Tekrar gönder" (31 Ekim 2026, Paket J1 #1): doğrulanmamış öğrenciye yeni doğrulama bağlantısı. Saatte 3, günde 10:
 * posta hattımız sınırsız değil (Workspace günde 2.000) ve bağlantı zaten 7 gün geçerli.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "email-verify-resend", limit: 3, windowSeconds: 3_600, dailyLimit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const { data } = await service.auth.admin.getUserById(userId);
  const user = data.user;
  if (!user?.email) return NextResponse.json({ error: "Hesabında e-posta yok." }, { status: 400 });
  if (!isEmailUnverified(user.app_metadata as Record<string, unknown>)) return NextResponse.json({ ok: true, verified: true });
  const name = String((user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "");
  const sent = await sendVerification({ userId, email: user.email, name });
  if (!sent) return NextResponse.json({ error: "E-posta şu an gönderilemedi. Birazdan tekrar dene." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
