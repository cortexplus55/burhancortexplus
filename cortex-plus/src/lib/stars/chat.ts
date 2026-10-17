import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/chat/chat-display";
import { awardStars } from "@/lib/stars/award";
import { CHAT_STARS, CHAT_STARS_AFTER_MESSAGES } from "@/lib/stars/rules";

/**
 * "Öğretmenle sohbet: günde bir kez, 3 mesajdan sonra" (Astra). İstanbul gününde
 * öğrencinin üçüncü mesajından sonra bir kez 15 yıldız; ref gündür.
 */
export async function awardChatStars(service: SupabaseClient, userId: string): Promise<number> {
  const day = istanbulDay();
  // Türkiye'de yaz saati yok: gün başı her zaman UTC+3.
  const since = new Date(`${day}T00:00:00+03:00`).toISOString();
  const { count, error } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);
  if (error || (count ?? 0) < CHAT_STARS_AFTER_MESSAGES) return 0;
  return awardStars(service, { userId, source: "chat", ref: `chat:${day}`, amount: CHAT_STARS });
}
