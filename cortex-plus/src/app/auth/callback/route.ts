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
      // Sahiplenme girişi durdurmaz; düşerse günlüğe yazılır (sessizce yutulmaz).
      const claimed = await claimUnverifiedAccount(data?.user ?? null).catch((err: unknown) => {
        console.error("unverified_claim_failed", {
          userId: data?.user?.id ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
        return false;
      });
      if (claimed) {
        // Şifreyle açılmış öbür oturumlar (hesabı başkasının adresiyle açan kişi) kapanır; bu oturum kalır.
        const { error: revokeError } = await supabase.auth
          .signOut({ scope: "others" })
          .catch((err: unknown) => ({ error: err }));
        if (revokeError) {
          console.error("unverified_claim_revoke_failed", {
            userId: data?.user?.id ?? null,
            message: revokeError instanceof Error ? revokeError.message : String(revokeError),
          });
        }
      }
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
async function claimUnverifiedAccount(
  user: { id: string; app_metadata?: Record<string, unknown> } | null,
): Promise<boolean> {
  if (!user || !isEmailUnverified(user.app_metadata)) return false;
  const providers = user.app_metadata?.providers;
  if (!Array.isArray(providers) || !providers.includes("google")) return false;
  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(user.id, {
    password: randomBytes(24).toString("base64url"),
    app_metadata: { ...(user.app_metadata ?? {}), [UNVERIFIED_FLAG]: false },
  });
  if (error) throw error;
  return true;
}
