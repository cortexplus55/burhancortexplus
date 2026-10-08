import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/auth/roles";
import { planTier } from "@/lib/billing/entitlements";
import { FREE_PREP_LIMIT } from "@/lib/billing/free-tier-copy";

export { FREE_PREP_LIMIT, FREE_PREP_LIMIT_CODE, FREE_PREP_LIMIT_MESSAGE } from "@/lib/billing/free-tier-copy";

/**
 * Ücretsiz hesap bir sınav hazırlığı kurabilir (3 Ekim 2026, ürün sahibinin
 * kararı). Astra'da ücretsiz hesap, kullanım sayacı %0'dayken bile yeni
 * hazırlık kuramıyor: sihirbazda ders seçilince "Ücretsiz kullanım limitine
 * ulaştın" duvarı çıkıyor.
 *
 * "Hedef puan" kaydı (`exam_type = 'hedef'`) hazırlık değil — hedef puan
 * ekranı onu yer tutucu olarak açıyor; sayılsaydı öğrencinin tek hakkını
 * yerdi.
 */
export async function freePrepLimitReached(
  service: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (await isAdminUser(service, userId).catch(() => false)) return false;
  if ((await planTier(service, userId)) !== "free") return false;
  const { count, error } = await service
    .from("exam_preps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("exam_type", "hedef");
  if (error) return false;
  return (count ?? 0) >= FREE_PREP_LIMIT;
}
