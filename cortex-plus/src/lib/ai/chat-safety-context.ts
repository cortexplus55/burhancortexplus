import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Yakın zamanda destek yanıtı verildi mi (10 Kasım 2026, güven paketi).
 *
 * İçerik denetimi kendine zarar sinyali görünce öğrenciye destek mesajını döndürür ve o mesaj sohbete KAYDEDİLMEZ;
 * sonraki turda geçmişte izi yoktur. "Genel duygu ifadesi kriz değildir" satırı bu yüzden yalnız geçmişe bakarak
 * yazılamaz: öğrenci az önce kriz ifadesi kullanmışsa "hâlâ aynı hissediyorum" cümlesi hafife alınmamalı. Denetim,
 * destek kararını `abuse_events`e ayrı bir kapsamla yazar (`SUPPORT_SCOPE`); burası son 24 saate bakar.
 *
 * Okuma düşerse true döner (bilinmiyor = koruyucu taraf): daraltma satırı yazılmaz, güvenlik satırı yazılır.
 */
export const SUPPORT_SCOPE = "chat-support";
export const SUPPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Aynı öğrencinin art arda destek kararları için kayıt aralığı (saniye). */
export const SUPPORT_NOTE_DEDUPE_SECONDS = 300;

export async function recentSupportVerdict(
  service: SupabaseClient,
  userId: string,
  now: number = Date.now(),
): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("abuse_events")
      .select("id")
      .eq("user_id", userId)
      .eq("signal", "moderation")
      .eq("scope", SUPPORT_SCOPE)
      .gte("created_at", new Date(now - SUPPORT_WINDOW_MS).toISOString())
      .limit(1);
    if (error) return true;
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}
