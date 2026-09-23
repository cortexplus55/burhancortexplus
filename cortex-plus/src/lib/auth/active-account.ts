import type { SupabaseClient } from "@supabase/supabase-js";

/** Uses a no-argument RPC: the database derives identity from the caller JWT.
 * A deleted profile is hidden by RLS, so a profile SELECT cannot distinguish it
 * from an account whose signup trigger has not created a profile yet.
 */
export async function isAccountActive(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc("current_account_active");
  if (error) throw new Error("account_status_unavailable");
  return data === true;
}
