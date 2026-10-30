import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeGlyphIdText } from "@/lib/documents/glyph-id-text";
import {
  checkMaterialSet,
  detectVersionPairs,
  type MaterialCheck,
  type SimilarityDocument,
  type VersionPair,
} from "@/lib/documents/material-similarity";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";

/** Kurulumun belgeleri, sayfa metinleriyle (yalnız öğrencinin kendi, silinmemiş belgeleri). */
export async function loadSimilarityDocuments(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<SimilarityDocument[]> {
  const ids = [...new Set(documentIds)];
  if (ids.length < 2) return [];
  const { data: docs, error } = await service
    .from("documents")
    .select("id, file_name, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error || !docs?.length) return [];
  const owned = new Set(docs.map((row) => row.id as string));
  const pages = await loadPagedDocumentRows(
    service,
    "document_pages",
    "document_id, page_number, text_content",
    ids.filter((id) => owned.has(id)),
    ["page_number"],
  );
  const byDoc = new Map<string, SimilarityDocument["pages"]>();
  for (const page of pages) {
    const id = page.document_id as string;
    const list = byDoc.get(id) ?? [];
    list.push({ pageNumber: page.page_number as number, text: decodeGlyphIdText(String(page.text_content ?? "")) });
    byDoc.set(id, list);
  }
  const meta = new Map(docs.map((row) => [row.id as string, row]));
  return ids
    .filter((id) => owned.has(id))
    .map((id) => ({
      documentId: id,
      fileName: String(meta.get(id)?.file_name ?? "") || "Belge",
      createdAt: (meta.get(id)?.created_at as string | null) ?? null,
      pages: byDoc.get(id) ?? [],
    }));
}

/** Kurulumdaki belge kümesinin denetimi: sürüm çiftleri ve ilgisiz görünen belgeler. Okuma düşerse boş. */
export async function readMaterialCheck(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  subject?: string | null,
): Promise<MaterialCheck> {
  try {
    const documents = await loadSimilarityDocuments(service, userId, documentIds);
    return checkMaterialSet(documents, { subject });
  } catch {
    return { versions: [], unrelated: [] };
  }
}

/** Yalnız sürüm çiftleri (çelişki uyarısını "eski sürüm" diye anlatmak için). */
export async function readVersionPairs(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<VersionPair[]> {
  try {
    return detectVersionPairs(await loadSimilarityDocuments(service, userId, documentIds));
  } catch {
    return [];
  }
}
