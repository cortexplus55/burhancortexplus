import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Sağlayıcı (Google) hata döndürdüyse kod hiç gelmiyor. Bu durum eskiden
  // "doğrulama bağlantısının süresi doldu" sayfasına düşüyordu — Google
  // onayını iptal eden öğrenci hiç almadığı bir e-postayı arıyordu.
  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?neden=saglayici`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
