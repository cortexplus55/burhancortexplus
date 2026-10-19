import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPremiumUser } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";

/**
 * Hızlı işlem (OpenAI Fast, jeton 2 kat) kimin için (19 Ekim 2026, ürün sahibinin kararı): yalnız Plus ve
 * Sigma, bir de kurucu (ücretsiz önizlemesi açık değilken). Maliyet modeli (`MALIYET-MODELI.md`): ders
 * $0,016 tutuyordu, kredisi $0,006; sebeplerden biri herkese açık hızlı işlemdi. 18 Ekim'deki "öğrenci
 * beklerken herkese" kararı bununla daraldı. Ücretsiz öğrencinin soğuk içeriği normal hızda yazılır;
 * önceden yazım zaten herkes için normal işlemde.
 *
 * Abonelik okunamazsa hızlı işlem verilmez (pahalı yol varsayılan olmasın).
 */
export async function fastAllowedFor(service: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const [premium, exempt] = await Promise.all([isPremiumUser(service, userId), billingExempt(service, userId)]);
    return premium || exempt;
  } catch {
    return false;
  }
}
