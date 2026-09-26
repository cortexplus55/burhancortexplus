import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchDocumentChunks } from "@/lib/rag/pipeline";

/**
 * "Belgem" kaynaklı üretim (quiz, flashcard, podcast) için tek bağlam yolu.
 *
 * Konuya en yakın parçalar önce; embedding yoksa ya da eşleşme çıkmazsa
 * belgenin ilk parçaları. Belge tamamlanmamış, silinmiş ya da boşsa `null` —
 * çağıran uç kredi ayırmadan önce bunu kontrol eder ki öğrenci hem kredi
 * kaybetmesin hem de "belge hazır değil" diye net bir sebep görsün.
 */
export type DocumentGenerationContext = {
  documentId: string;
  fileName: string;
  excerpt: string;
};

export async function loadDocumentGenerationContext(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  topic: string,
  options: { maxChars?: number; limit?: number } = {},
): Promise<DocumentGenerationContext | null> {
  const { data: doc } = await service
    .from("documents")
    .select("id, file_name, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc || doc.status !== "completed") return null;

  const limit = options.limit ?? 8;
  let parts: string[] = [];
  try {
    const matches = await searchDocumentChunks(service, userId, topic, limit, {
      documentId,
    });
    parts = matches.map((m) => m.content);
  } catch {
    parts = [];
  }
  if (!parts.length) {
    const { data: chunks } = await service
      .from("document_chunks")
      .select("content")
      .eq("document_id", documentId)
      .order("chunk_index")
      .limit(limit);
    parts = (chunks ?? []).map((c) => c.content as string);
  }
  if (!parts.length) return null;

  return {
    documentId,
    fileName: doc.file_name as string,
    excerpt: parts.join("\n---\n").slice(0, options.maxChars ?? 12_000),
  };
}
