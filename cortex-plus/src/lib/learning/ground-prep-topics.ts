import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groundTopicTitle,
  topicRejectedMessage,
  type GroundingCorpus,
  type GroundMatch,
} from "@/lib/learning/topic-grounding";
import { foldTr } from "@/lib/documents/page-analysis";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";

const PAGE_TEXT_CAP = 6000;

export async function loadGroundingCorpus(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<GroundingCorpus | null> {
  if (!documentIds.length) return { titles: [], pages: [] };

  const { data: docs, error: docError } = await service
    .from("documents")
    .select("id, file_name")
    .eq("user_id", userId)
    .in("id", documentIds)
    .is("deleted_at", null);
  if (docError) return null;

  const owned = new Set((docs ?? []).map((row) => row.id as string));
  if (documentIds.some((id) => !owned.has(id))) return null;

  const [nodes, pages] = await Promise.all([
    loadPagedDocumentRows(
      service,
      "document_topic_nodes",
      "id, document_id, title",
      documentIds,
      ["id"],
    ),
    loadPagedDocumentRows(
      service,
      "document_pages",
      "document_id, page_number, text_content, headings",
      documentIds,
      ["page_number"],
    ),
  ]);

  const corpusPages: GroundingCorpus["pages"] = [];
  for (const row of pages) {
    const documentId = row.document_id as string;
    const text = ((row.text_content as string | null) ?? "").slice(0, PAGE_TEXT_CAP);
    const headings = Array.isArray(row.headings)
      ? (row.headings as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    if (!text.trim() && !headings.length) continue;
    corpusPages.push({
      documentId,
      pageNumber: row.page_number as number,
      text,
      headings,
      searchText: foldTr([text, ...headings].join("\n")),
    });
  }

  return {
    titles: nodes
      .map((row) => row.title as string)
      .filter((title) => title.trim().length > 0),
    pages: corpusPages,
    fileNamesByDocument: Object.fromEntries(
      (docs ?? []).map((row) => [row.id as string, (row.file_name as string | null) ?? ""]),
    ),
  };
}

export async function groundPrepTopics(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  titles: string[],
): Promise<
  | { ok: true; matches: GroundMatch[]; titles: string[] }
  | { ok: false; message: string }
> {
  const corpus = await loadGroundingCorpus(service, userId, documentIds);
  if (!corpus) return { ok: false, message: "Bu belgeler sana ait değil." };

  const matches: GroundMatch[] = [];
  const kept: string[] = [];
  for (const title of titles) {
    const match = groundTopicTitle(title, corpus);
    if (!match.ok) {
      return { ok: false, message: match.message || topicRejectedMessage(title) };
    }
    matches.push(match);
    kept.push(title.trim());
  }
  return { ok: true, matches, titles: kept };
}
