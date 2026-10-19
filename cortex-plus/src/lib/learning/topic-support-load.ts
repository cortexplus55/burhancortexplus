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
 * Hazırlığın materyali: sahibinin silinmemiş belgeleri ve sayfa metinleri. Yardımcı kaynakları hem
 * derste (`loadTopicSupport`) hem kurulumun konu listesinde (`supportFilesForTopics`) aynı veri
 * hesaplar; ikisi ayrışırsa sihirbazın "3 kaynak" dediği konunun dersi başka dosya okurdu.
 */
async function loadSupportCorpus(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<SupportSourcePage[]> {
  const { data: docs } = await service
    .from("documents")
    .select("id, file_name")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", documentIds);
  const fileName = new Map((docs ?? []).map((row) => [row.id as string, (row.file_name as string | null) ?? "Belge"]));
  if (!fileName.size) return [];
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
  return rows.flatMap((row) => {
    const text = ((row.text_content as string | null) ?? "").trim();
    const documentId = row.document_id as string;
    return text
      ? [
          {
            documentId,
            fileName: fileName.get(documentId) ?? "Belge",
            page: row.page_number as number,
            text,
            pageCount: pageCount.get(documentId) ?? 1,
          },
        ]
      : [];
  });
}

/** Konuların yarısından azının kaynağı varsa (eski, haritasız hazırlık) eşleme tahmine döner. */
function enoughProfiles(topics: SupportTopic[]): boolean {
  return topics.filter((topic) => topic.refs.some((ref) => ref.pages.length)).length * 2 >= topics.length;
}

/**
 * Hazırlıktaki bir konunun yardımcı kaynakları (`topic-support-pages.ts`). Kayıt yazılmaz; her
 * üretimde hazırlığın konularından ve sayfalarından yeniden hesaplanır, böylece eski hazırlıklar da
 * yararlanır. Okuma düşerse boş döner — ders kendi sayfalarıyla yazılır.
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

    const { data: topicRows } = await service
      .from("exam_prep_topics")
      .select("id, label, source_refs")
      .eq("exam_prep_id", input.prepId);
    const topics: SupportTopic[] = (topicRows ?? []).map((row) => ({
      id: row.id as string,
      title: String(row.label ?? ""),
      refs: parseTopicSourceRefs(row.source_refs)
        .filter((ref) => documentIds.includes(ref.documentId))
        .map((ref) => ({ documentId: ref.documentId, pages: ref.pages })),
    }));
    if (!topics.some((topic) => topic.id === input.topicId) || !enoughProfiles(topics)) return [];

    const pages = await loadSupportCorpus(service, input.userId, documentIds);
    return assignSupportExcerpts(topics, pages).get(input.topicId) ?? [];
  } catch (error) {
    console.error("topic_support_failed", { message: error instanceof Error ? error.message : "unknown" });
    return [];
  }
}

/**
 * Kurulumun konu listesi için: her konunun yardımcı dosyalarının adları (konunun kendi dosyası
 * hariç). Sihirbaz "N kaynak" bunlarla birlikte sayar. Okuma düşerse boş.
 */
export async function supportFilesForTopics(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  topics: SupportTopic[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (documentIds.length < 2 || !enoughProfiles(topics)) return out;
  try {
    const pages = await loadSupportCorpus(service, userId, documentIds);
    for (const [topicId, excerpts] of assignSupportExcerpts(topics, pages)) {
      const own = new Set(topics.find((topic) => topic.id === topicId)?.refs.map((ref) => ref.documentId) ?? []);
      const names = [...new Set(excerpts.filter((item) => !own.has(item.documentId)).map((item) => item.fileName))];
      if (names.length) out.set(topicId, names);
    }
  } catch (error) {
    console.error("topic_support_files_failed", { message: error instanceof Error ? error.message : "unknown" });
  }
  return out;
}

export function supportPagesForEngine(excerpts: SupportExcerpt[]): SupportPage[] {
  return excerpts.map((excerpt) => ({ page: excerpt.page, text: excerpt.text, label: supportLabel(excerpt) }));
}
