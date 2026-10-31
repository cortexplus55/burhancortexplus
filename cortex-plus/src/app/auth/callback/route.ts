import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exchangeFailurePath, providerFailurePath } from "@/lib/auth/link-failure";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { UNVERIFIED_FLAG, isEmailUnverified } from "@/lib/auth/email-verification";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Hata parametresi geldiyse kod yok. Süresi dolmuş e-posta bağlantısı ile
  // Google hatası ayrı sayfalara gidiyor (bkz. lib/auth/link-failure.ts).
  const providerFailure = providerFailurePath(searchParams);
  if (providerFailure) {
    return NextResponse.redirect(`${origin}${providerFailure}`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await claimUnverifiedAccount(data?.user ?? null).catch(() => undefined);
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}${exchangeFailurePath(error, next)}`);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

/**
 * Doğrulanmamış hesaba Google ile giriş (31 Ekim 2026, Paket J1 #1). Kayıt artık doğrulama beklemediği için biri
 * başkasının adresiyle şifreli hesap açabilir; gerçek sahip sonra Google ile girerse Supabase iki kimliği aynı
 * hesapta birleştirir ve açan kişinin şifresi çalışmaya devam ederdi. Google kutunun sahibini kanıtladı: bayrak
 * kalkar ve şifre rastgele bir değerle değişir (şifreyle girmek isteyen gerçek sahip "Şifremi unuttum"u kullanır).
 */
async function claimUnverifiedAccount(user: { id: string; app_metadata?: Record<string, unknown> } | null) {
  if (!user || !isEmailUnverified(user.app_metadata)) return;
  const providers = user.app_metadata?.providers;
  if (!Array.isArray(providers) || !providers.includes("google")) return;
  const service = createServiceClient();
  await service.auth.admin.updateUserById(user.id, {
    password: randomBytes(24).toString("base64url"),
    app_metadata: { ...(user.app_metadata ?? {}), [UNVERIFIED_FLAG]: false },
  });
}
