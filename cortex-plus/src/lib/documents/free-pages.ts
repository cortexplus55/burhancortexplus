import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planTier } from "@/lib/billing/entitlements";
import { billingExempt, freePreview } from "@/lib/billing/free-preview";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";

export { FREE_PAGE_TOTAL };

/**
 * Ücretsiz katmanın belge sınırı (3 Ekim 2026, ürün sahibinin kararı):
 * hesap başına TOPLAM 5 sayfa işlenir; fazlası için ücretli plan gerekir.
 * Astra'da da ücretsiz hesap yeni hazırlık kuramıyor, materyal
 * yükleyemiyor; bizde küçük bir tadımlık bırakıldı.
 *
 * Sayılan: işlenmiş ya da işlenmekte olan belgelerin `page_count`'u (işlenen
 * sayfa) — silinmiş belgeler dahil, yoksa yükle-sil döngüsü sınırı aşardı.
 * Ücretli ve yönetici hesapta sınır yok (`null`). Yöneticinin ücretsiz
 * önizlemesinde yalnız önizleme başladıktan sonra eklenen belgeler sayılır.
 */
export async function freePagesRemaining(
  service: SupabaseClient,
  userId: string,
  excludeDocumentId?: string,
): Promise<number | null> {
  if (await billingExempt(service, userId).catch(() => false)) return null;
  const preview = await freePreview(service, userId).catch(() => null);
  if (!preview && (await planTier(service, userId)) !== "free") return null;
  let query = service
    .from("documents")
    .select("page_count")
    .eq("user_id", userId)
    .in("status", ["completed", "processing"]);
  if (excludeDocumentId) query = query.neq("id", excludeDocumentId);
  if (preview) query = query.gte("created_at", preview.startedAt);
  const { data, error } = await query;
  if (error) throw new Error("free_page_lookup_failed");
  const used = (data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.page_count ?? 0)), 0);
  return Math.max(0, FREE_PAGE_TOTAL - used);
}

/** İşlenecek son sayfa: ücretsizde kalan hak kadar, değilse dosyanın sonu. */
export function cappedPageTotal(total: number, remaining: number | null): number {
  return remaining == null ? total : Math.min(total, remaining);
}
