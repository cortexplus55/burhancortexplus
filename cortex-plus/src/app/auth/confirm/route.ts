import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { exchangeFailurePath, providerFailurePath } from "@/lib/auth/link-failure";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const providerFailure = providerFailurePath(searchParams);
  if (providerFailure) redirect(providerFailure);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    // token_hash yoksa başka deneme kalmadı; sebebi doğru söyle.
    if (!(token_hash && type)) redirect(exchangeFailurePath(error, next));
  }

  // token_hash ile doğrulama tarayıcıdan bağımsız: bağlantı telefonda da açılır.
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
  }

  redirect("/auth/auth-code-error");
}
