import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { exchangeFailurePath, providerFailurePath } from "@/lib/auth/link-failure";

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}${exchangeFailurePath(error, next)}`);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
