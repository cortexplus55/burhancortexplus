import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";
import { commitCredits, reserveCredits } from "@/lib/credits/service";

/**
 * İşi bitmiş birimleri hemen faturalar: ayır ve kesinleştir. Belge sayfaları
 * için (8 Ekim 2026): taranmış sayfa OCR'dan sonra, metin belgesinin ek
 * sayfaları işlendikten sonra sayılır. Aynı anahtar ikinci kez çağrılırsa
 * kredi bir daha düşmez.
 *
 * Hak o an yetmezse `false` döner; iş zaten yapılmıştır, öğrenciden geri
 * alınmaz. Ön kontrol (`spendableCredits`) bunu nadir tutar.
 */
export async function chargeNow(
  service: SupabaseClient,
  userId: string,
  actionCode: ActionCode,
  idempotencyKey: string,
  quantity: number,
): Promise<boolean> {
  if (quantity < 1) return true;
  const reservation = await reserveCredits(service, userId, actionCode, idempotencyKey, quantity);
  if (!reservation.ok) return reservation.reason === "operation_completed";
  await commitCredits(service, reservation.reservationId);
  return true;
}
