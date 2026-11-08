import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Bir kez" garantisi (7-8 Kasım 2026): `email_events`te `once:` anahtarlı satır. Önce satır yazılır (benzersiz indeks,
 * ikinci istek çarpışır), sonra gönderilir; gönderim düşerse satır silinir ve yeniden denenebilir. Davet e-postası,
 * hediye bildirimi, hoş geldin ve satın alma e-postaları aynı yoldan geçer.
 */
export async function claimOnce(service: SupabaseClient, userId: string, key: string): Promise<boolean> {
  const { error } = await service.from("email_events").insert({ user_id: userId, template_key: key, status: "claimed" });
  return !error;
}

export async function settleOnce(service: SupabaseClient, userId: string, key: string, sent: boolean): Promise<void> {
  if (sent) await service.from("email_events").update({ status: "sent" }).eq("user_id", userId).eq("template_key", key);
  else await service.from("email_events").delete().eq("user_id", userId).eq("template_key", key).eq("status", "claimed");
}
