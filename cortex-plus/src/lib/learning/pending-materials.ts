import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";

/**
 * Hazırlığa bağlı bekleyen materyal (31 Ekim 2026, hızlı başlatma). Öğrenci kurulumda hazır olanla başlar; okunmakta
 * olan belgeler `exam_prep_pending_materials`'ta bekler. Hazırlık sayfasındaki şerit onları okutur, haritalar ve
 * add-source ile ekler. Tablo yokken (göç uygulanmadan yayın) her işlev sessizce boş döner: belge Belgelerim'de kalır.
 */

export type PendingMaterial = {
  documentId: string;
  fileName: string;
  /** documents.status: pending (yükleme yarım), processing, completed, failed. */
  status: string;
  error: string | null;
  /** Okunmuş sayfa / toplam (ingestion durumundan; bilinmiyorsa null). */
  pagesDone: number | null;
  pageCount: number | null;
};

/** Kurulumda: hazırlığa bekleyen belgeleri yazar. Yalnız öğrencinin kendi, silinmemiş belgeleri. */
export async function recordPendingMaterials(
  service: SupabaseClient,
  input: { prepId: string; userId: string; documentIds: string[] },
): Promise<number> {
  const ids = [...new Set(input.documentIds)];
  if (!ids.length) return 0;
  const { data: owned, error: ownedError } = await service
    .from("documents")
    .select("id")
    .in("id", ids)
    .eq("user_id", input.userId)
    .is("deleted_at", null);
  if (ownedError) return 0;
  const rows = (owned ?? []).map((row) => ({
    prep_id: input.prepId,
    document_id: row.id as string,
    user_id: input.userId,
  }));
  if (!rows.length) return 0;
  const { error } = await service
    .from("exam_prep_pending_materials")
    .upsert(rows, { onConflict: "prep_id,document_id", ignoreDuplicates: true });
  if (error) {
    if (!missingRelation(error)) console.error("pending_materials_record_failed", { code: error.code });
    return 0;
  }
  return rows.length;
}

/** Hazırlık sayfası şeridi yalnız bekleyen belge varken bağlar (her açılışta boşuna istek gitmesin). */
export async function countPendingMaterials(
  service: SupabaseClient,
  input: { prepId: string; userId: string },
): Promise<number> {
  const { count, error } = await service
    .from("exam_prep_pending_materials")
    .select("document_id", { count: "exact", head: true })
    .eq("prep_id", input.prepId)
    .eq("user_id", input.userId);
  return error ? 0 : count ?? 0;
}

/** Hazırlığın bekleyen belgeleri, okuma ilerlemesiyle; seçim sırası (oluşturulma, sonra belge sırası). */
export async function listPendingMaterials(
  service: SupabaseClient,
  input: { prepId: string; userId: string },
): Promise<PendingMaterial[]> {
  const { data: rows, error } = await service
    .from("exam_prep_pending_materials")
    .select("document_id, created_at")
    .eq("prep_id", input.prepId)
    .eq("user_id", input.userId)
    .order("created_at");
  if (error || !rows?.length) return [];
  const ids = rows.map((row) => row.document_id as string);
  const [{ data: docs }, { data: states }] = await Promise.all([
    service
      .from("documents")
      .select("id, file_name, status, error_message, page_count, deleted_at")
      .in("id", ids)
      .eq("user_id", input.userId),
    service.from("document_ingestion_state").select("document_id, next_page, total_pages").in("document_id", ids),
  ]);
  const docById = new Map((docs ?? []).map((row) => [row.id as string, row]));
  const stateById = new Map((states ?? []).map((row) => [row.document_id as string, row]));
  return ids.flatMap((id) => {
    const doc = docById.get(id);
    if (!doc || doc.deleted_at) return [];
    const state = stateById.get(id);
    const total = typeof state?.total_pages === "number" ? state.total_pages : (typeof doc.page_count === "number" ? doc.page_count : null);
    const next = typeof state?.next_page === "number" ? state.next_page : null;
    const done = doc.status === "completed" && total != null ? total : next != null ? Math.max(0, next - 1) : null;
    return [{
      documentId: id,
      fileName: String(doc.file_name ?? "Belge"),
      status: String(doc.status ?? "processing"),
      error: typeof doc.error_message === "string" ? doc.error_message : null,
      pagesDone: done,
      pageCount: total,
    }];
  });
}

/** Eklenen ya da öğrencinin vazgeçtiği belgeler bekleyen listeden çıkar. */
export async function clearPendingMaterials(
  service: SupabaseClient,
  input: { prepId: string; userId: string; documentIds: string[] },
): Promise<void> {
  if (!input.documentIds.length) return;
  const { error } = await service
    .from("exam_prep_pending_materials")
    .delete()
    .eq("prep_id", input.prepId)
    .eq("user_id", input.userId)
    .in("document_id", input.documentIds);
  if (error && !missingRelation(error)) console.error("pending_materials_clear_failed", { code: error.code });
}
