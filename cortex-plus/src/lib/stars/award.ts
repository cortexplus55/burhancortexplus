import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StarSource } from "@/lib/stars/rules";

/**
 * Yıldız yazar (service_role). Aynı (öğrenci, kaynak, ref) ikinci kez yazılmaz;
 * günlük hedef, haftalık seri ve davet bonusları veritabanında eklenir. Asıl işi
 * (ders bitirme, düello, sohbet) asla düşürmez: hata olursa 0 döner ve loglar.
 */
export async function awardStars(
  service: SupabaseClient,
  input: { userId: string; source: StarSource; ref: string; amount: number },
): Promise<number> {
  if (!input.userId || !(input.amount > 0)) return 0;
  try {
    const { data, error } = await service.rpc("award_stars", {
      p_user: input.userId,
      p_source: input.source,
      p_ref: input.ref,
      p_amount: Math.round(input.amount),
    });
    if (error) {
      console.error("award_stars_failed", { source: input.source, message: error.message.slice(0, 160) });
      return 0;
    }
    return Number(data ?? 0) || 0;
  } catch (error) {
    console.error("award_stars_failed", {
      source: input.source,
      message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return 0;
  }
}
