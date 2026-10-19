import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";
import {
  assignSupportExcerpts,
  supportLabel,
  type SupportExcerpt,
  type SupportSourcePage,
  type SupportTopic,
} from "@/lib/learning/topic-support-pages";

/** Öğretmen motoruna giden yardımcı sayfa: kendi etiketiyle ("Ek kaynak · …"). */
export type SupportPage = { page: number; text: string; label: string };

/**
 * Hazırlıktaki bir konunun yardımcı kaynakları (`topic-support-pages.ts`). Kayıt yazılmaz; her
 * üretimde hazırlığın konularından ve sayfalarından yeniden hesaplanır, böylece eski hazırlıklar da
 * yararlanır. Konuların yarısından azının kaynağı varsa (eski, haritasız hazırlık) hesaplanmaz:
 * başlıktan başka profil yokken eşleme tahmine döner. Okuma düşerse boş döner — ders kendi
 * sayfalarıyla yazılır.
 */
export async function loadTopicSupport(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string | null | undefined },
): Promise<SupportExcerpt[]> {
  if (!input.topicId) return [];
  try {
    const { data: prep } = await service
      .from("exam_preps")
      .select("document_id, source_document_ids")
      .eq("id", input.prepId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!prep) return [];
    const documentIds = prepSourceDocumentIds({
      documentId: (prep.document_id as string | null) ?? null,
      sourceDocumentIds: Array.isArray(prep.source_document_ids)
        ? (prep.source_document_ids as unknown[]).filter((id): id is string => typeof id === "string")
        : [],
    });
    if (documentIds.length < 2) return [];

    const [{ data: topicRows }, { data: docs }] = await Promise.all([
      service.from("exam_prep_topics").select("id, label, source_refs").eq("exam_prep_id", input.prepId),
      service
        .from("documents")
        .select("id, file_name")
        .eq("user_id", input.userId)
        .is("deleted_at", null)
        .in("id", documentIds),
    ]);
    const topics: SupportTopic[] = (topicRows ?? []).map((row) => ({
      id: row.id as string,
      title: String(row.label ?? ""),
      refs: parseTopicSourceRefs(row.source_refs)
        .filter((ref) => documentIds.includes(ref.documentId))
        .map((ref) => ({ documentId: ref.documentId, pages: ref.pages })),
    }));
    if (!topics.some((topic) => topic.id === input.topicId)) return [];
    if (topics.filter((topic) => topic.refs.some((ref) => ref.pages.length)).length * 2 < topics.length) return [];

    const fileName = new Map((docs ?? []).map((row) => [row.id as string, (row.file_name as string | null) ?? "Belge"]));
    const rows = await loadPagedDocumentRows(
      service,
      "document_pages",
      "document_id, page_number, text_content",
      [...fileName.keys()],
      ["page_number"],
    );
    const pageCount = new Map<string, number>();
    for (const row of rows) {
      const id = row.document_id as string;
      pageCount.set(id, (pageCount.get(id) ?? 0) + 1);
    }
    const pages: SupportSourcePage[] = rows.flatMap((row) => {
      const text = ((row.text_content as string | null) ?? "").trim();
      const documentId = row.document_id as string;
      return text
        ? [{ documentId, fileName: fileName.get(documentId) ?? "Belge", page: row.page_number as number, text, pageCount: pageCount.get(documentId) ?? 1 }]
        : [];
    });
    return assignSupportExcerpts(topics, pages).get(input.topicId) ?? [];
  } catch (error) {
    console.error("topic_support_failed", { message: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}

export function supportPagesForEngine(excerpts: SupportExcerpt[]): SupportPage[] {
  return excerpts.map((excerpt) => ({ page: excerpt.page, text: excerpt.text, label: supportLabel(excerpt) }));
}
