import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Stüdyoların "Belgem" seçicisi için hazır belgeler — en yeni önce. */
export type DocumentOption = { id: string; fileName: string };

export async function loadCompletedDocumentOptions(
  supabase: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<DocumentOption[]> {
  const { data } = await supabase
    .from("documents")
    .select("id, file_name")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    fileName: (d.file_name as string) || "Belge",
  }));
}
