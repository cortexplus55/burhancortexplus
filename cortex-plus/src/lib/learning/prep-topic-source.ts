import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { loadPrepDocumentIds } from "@/lib/documents/teacher-analysis-run";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import { loadSourceContext, pagesMarkedInSource } from "@/lib/learning/source-context";
import { resolvePrepTopicRow } from "@/lib/learning/prep-topic-lookup";

/**
 * Hazırlıktaki bir konunun temiz kaynak sayfaları — hazırlık podcast'inin
 * (`/api/learning/exam-prep/podcast`) izlediği yolun aynısı: konuya bağlı belge
 * düğümünün sayfaları, yoksa kaynak aramasında işaretlenen sayfalar; bitişik çekirdek
 * sayfalar temiz metinle. Belgesiz hazırlıkta konu kipi. Belge var ama sayfa
 * bulunamadıysa null (çağıran kredi ayırmadan "source_unavailable" döner).
 */
export async function prepTopicSource(
  service: SupabaseClient,
  input: { userId: string; prepId: string; prepTitle: string; prepDocumentId: string | null; topicId: string; topicLabel: string },
): Promise<{ mode: "document" | "topic"; pages: { page: number; text: string }[] } | null> {
  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const prepDocs = teachingV2 ? await loadPrepDocumentIds(service, input.prepId) : [];
  let documentId = input.prepDocumentId ?? prepDocs[0] ?? null;
  let pageNumbers: number[] = [];

  const linked = await resolvePrepTopicRow<{ id: string; document_topic_node_id: string | null }>(
    service,
    input.prepId,
    input.topicId,
    "id, document_topic_node_id",
  );
  const nodeId = typeof linked?.document_topic_node_id === "string" ? linked.document_topic_node_id : null;
  if (nodeId) {
    const { data: node } = await service.from("document_topic_nodes").select("document_id").eq("id", nodeId).maybeSingle();
    if (node?.document_id) documentId = node.document_id as string;
    const pages = await service.from("document_topic_page_links").select("page_number").eq("topic_id", nodeId);
    if (!pages.error && Array.isArray(pages.data)) {
      pageNumbers = pages.data.map((row) => Number(row.page_number)).filter((page) => Number.isInteger(page) && page > 0);
    }
  }
  if (!documentId) return { mode: "topic", pages: [] };
  if (!pageNumbers.length) {
    try {
      const found = await loadSourceContext(service, input.userId, `${input.prepTitle} ${input.topicLabel}`, {
        documentId,
        sourceBoundaryMode: "documents_only",
      });
      pageNumbers = pagesMarkedInSource(found.block);
    } catch {
      pageNumbers = [];
    }
  }
  if (!pageNumbers.length) return null;
  const edges = await documentRunningHeaders(service, documentId);
  const clean = await ensureCleanPages(service, { userId: input.userId, documentId, pages: corePageRun(pageNumbers), edges });
  if (!clean.length) return null;
  return { mode: "document", pages: clean.map((item) => ({ page: item.page, text: item.text })) };
}
