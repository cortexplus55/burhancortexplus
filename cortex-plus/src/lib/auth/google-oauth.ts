import type { SupabaseClient } from "@supabase/supabase-js";

/** Google OAuth via Supabase — consent screen branding is configured in GCP + Supabase project name. */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  redirectTo: string,
) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  return { error };
}
