import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeGlyphIdText } from "@/lib/documents/glyph-id-text";
import { exclusionPhrases } from "@/lib/learning/cross-material-topics";

/**
 * Kapsam dışı ipucu taşıyabilecek sayfalar. Bütün kitabı okumamak için yalnız ipucunun sözcüklerinden
 * birini taşıyan sayfalar gelir; karar yine `exclusionPhrases` cümle kuralıyla verilir.
 */
const CUE_WORDS = [
  "kapsam", "finalde", "vizede", "sınavda", "sinavda", "dahil değil", "dahil degil", "sorumlu değil",
  "sorumlu degil", "sorulmayacak", "çıkmayacak", "cikmayacak", "hariç", "haric", "out of scope",
  "not be examined", "not be tested", "not examinable",
];
const MAX_PAGES = 400;

/** Hazırlığın belgelerindeki kapsam dışı ifadeler. Okuma düşerse boş: liste olduğu gibi kalır. */
export async function readScopeExclusionPhrases(service: SupabaseClient, documentIds: string[]): Promise<string[]> {
  if (!documentIds.length) return [];
  try {
    const { data, error } = await service
      .from("document_pages")
      .select("document_id, page_number, text_content")
      .in("document_id", documentIds)
      .or(CUE_WORDS.map((word) => `text_content.ilike.%${word}%`).join(","))
      .limit(MAX_PAGES);
    if (error || !data) return [];
    const text = data.map((row) => decodeGlyphIdText(String(row.text_content ?? ""))).join("\n");
    return exclusionPhrases(text);
  } catch {
    return [];
  }
}
