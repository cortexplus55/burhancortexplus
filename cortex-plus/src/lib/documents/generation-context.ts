import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pageSourceBlock } from "@/lib/learning/source-context";

/**
 * "Belgem" modu: quiz yalnızca bu belgenin sayfalarından üretilir.
 *
 * Belge çok sayfalıysa hepsini tek çağrıya sığdırmaya çalışmak (her sayfaya
 * düşen payı eritir) yerine ilk kırk sayfayla sınırlanır — quiz birkaç
 * sorudan ibarettir, dersin aksine belgenin tamamını sindirmesi gerekmez.
 */
const MAX_PAGES = 40;

export type DocumentGenerationContext = {
  fileName: string;
  excerpt: string;
};

export async function loadDocumentGenerationContext(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  topic: string,
): Promise<DocumentGenerationContext | null> {
  void topic;
  const { data: doc, error: docError } = await service
    .from("documents")
    .select("file_name")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !doc) return null;

  const { data: pages, error: pagesError } = await service
    .from("document_pages")
    .select("page_number, text_content, formulas, extraction_ok, page_kind")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true })
    .limit(MAX_PAGES);
  if (pagesError) return null;

  const usable = (pages ?? [])
    .filter(
      (page) =>
        page.extraction_ok !== false &&
        page.page_kind !== "unreadable" &&
        ((page.text_content as string | null) ?? "").trim().length > 0,
    )
    .map((page) => ({
      pageNumber: page.page_number as number,
      text: (page.text_content as string | null) ?? "",
      formulas: ((page.formulas as string[] | null) ?? []).slice(0, 8),
    }));
  if (!usable.length) return null;

  const fileName = (doc.file_name as string | null) ?? "belge";
  const excerpt = pageSourceBlock(fileName, usable, true);
  if (!excerpt.trim()) return null;
  return { fileName, excerpt };
}
