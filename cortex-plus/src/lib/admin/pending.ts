import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bekleyen öğretmen başvurusu sayısı.
 *
 * Her yönetim sayfası bunu menüdeki rozet için istiyor; tek yerde durması
 * gerekiyordu, yoksa on iki sayfada on iki kopya sorgu olurdu.
 */
export async function countPendingApplications(
  service: SupabaseClient,
): Promise<number> {
  const { count } = await service
    .from("teacher_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
