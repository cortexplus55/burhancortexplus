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

/** İlk hatadan sonra ikinci denemeye kadar beklenen süre. */
export const ACCOUNT_CHECK_RETRY_MS = 300;

/**
 * Durum okunamayınca bir kez daha dener (29 Ekim 2026, Paket H). Canlıda tek bir RPC hatası
 * `_rsc` isteğini 503'e düşürüyordu; iki hata da "askıda" ya da "silinmiş" demek değildir.
 * `true` / `false` ilk okumada kesindir; iki okuma da düşerse `null` döner, çağıran geçirir ve
 * günlükler — askı ve silinme RLS'te ve sayfa kapısında bir kez daha denetleniyor.
 */
export async function accountActiveOrUnknown(
  client: SupabaseClient,
  options: { retryMs?: number } = {},
): Promise<boolean | null> {
  try {
    return await isAccountActive(client);
  } catch {
    // Bir kez daha, kısa aradan sonra.
  }
  await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? ACCOUNT_CHECK_RETRY_MS));
  try {
    return await isAccountActive(client);
  } catch {
    return null;
  }
}
