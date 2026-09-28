import type { SupabaseClient } from "@supabase/supabase-js";
import { STALE_PROCESSING_MS } from "@/lib/documents/processing-stale";

/**
 * Takılı kalan belgeleri `failed` yapar; dashboard ana aksiyonu sonsuza dek
 * "işleniyor" demesin. Koşullu güncelleme — yalnızca gerçekten bayat kayıtlar.
 */
export async function failStaleProcessingDocuments(
  service: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const { data, error } = await service
    .from("documents")
    .update({
      status: "failed",
      error_message: "processing_timeout",
    })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["pending", "processing"])
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("fail_stale_processing_documents", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
