import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickStudyTopics } from "@/lib/learning/diagnostic";

/**
 * Stüdyoların "Belgem" seçicisi için hazır belgeler — en yeni önce. 19 Ekim 2026'dan beri belgenin
 * çalışılacak konularıyla: belge seçilince örnek konular belgenin kendi konuları olur (önce
 * "Türev kuralları", "Tarih terimleri" gibi belgeyle ilgisiz örnekler duruyordu).
 */
export type DocumentOption = { id: string; fileName: string; topics: string[] };

const TOPICS_PER_DOCUMENT = 8;

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
    // Hızlı başlatmanın gizli baş kopyası seçilmez: ana belge tamamını taşır (document-head.ts).
    .is("part_of", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const documents = (data ?? []).map((d) => ({
    id: d.id as string,
    fileName: (d.file_name as string) || "Belge",
  }));
  if (!documents.length) return [];

  const { data: nodes } = await supabase
    .from("document_topic_nodes")
    .select("id, document_id, title, parent_id, sort_order")
    .in("document_id", documents.map((d) => d.id))
    .order("sort_order", { ascending: true });
  const rows = (nodes ?? []) as { id: string; document_id: string; title: string; parent_id: string | null }[];
  return documents.map((doc) => {
    const own = rows.filter((row) => row.document_id === doc.id)
      .map((row) => ({ id: row.id, title: row.title, parentId: row.parent_id ?? null }));
    const titles = pickStudyTopics(own).map((row) => row.title.trim()).filter(Boolean);
    return { ...doc, topics: [...new Set(titles)].slice(0, TOPICS_PER_DOCUMENT) };
  });
}
