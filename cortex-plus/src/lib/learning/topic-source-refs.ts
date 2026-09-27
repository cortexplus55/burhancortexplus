/**
 * exam_prep_topics.source_refs ortak okuyucu.
 *
 * Tanı yolu (#136) ve ders kaynağı çözücüsü aynı biçimi kullanır;
 * belge başına documentId + nodeId + pages ayrılır — sayfa numarası
 * belgeler arasında karıştırılmaz.
 */

import type { TopicSourceRef } from "@/lib/learning/topic-merge";

export type ParsedTopicSourceRef = {
  documentId: string;
  nodeId: string | null;
  pages: number[];
  fileName: string | null;
};

/** Kaynak ref satırını güvenli biçimde ayıkla. */
export function parseTopicSourceRef(raw: unknown): ParsedTopicSourceRef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const documentId = row.documentId;
  if (typeof documentId !== "string" || !documentId) return null;
  const pages = Array.isArray(row.pages)
    ? [...new Set(
        row.pages.filter(
          (page): page is number =>
            typeof page === "number" && Number.isInteger(page) && page > 0,
        ),
      )].sort((a, b) => a - b)
    : [];
  const nodeId = typeof row.nodeId === "string" && row.nodeId ? row.nodeId : null;
  const fileName =
    typeof row.fileName === "string" && row.fileName.trim()
      ? row.fileName.trim()
      : null;
  return { documentId, nodeId, pages, fileName };
}

export function parseTopicSourceRefs(raw: unknown): ParsedTopicSourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTopicSourceRef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = parseTopicSourceRef(item);
    if (!parsed) continue;
    const key = `${parsed.documentId}:${parsed.nodeId ?? ""}:${parsed.pages.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export function toTopicSourceRef(parsed: ParsedTopicSourceRef): TopicSourceRef {
  return {
    documentId: parsed.documentId,
    fileName: parsed.fileName ?? "",
    pages: parsed.pages,
    nodeId: parsed.nodeId,
  };
}

/** Hazırlığın izin verdiği belge kimlikleri. */
export function allowedPrepDocumentIds(input: {
  primaryDocumentId?: string | null;
  sourceDocumentIds?: unknown;
  extraDocumentIds?: Array<string | null | undefined>;
}): Set<string> {
  const ids = [
    ...(Array.isArray(input.sourceDocumentIds) ? input.sourceDocumentIds : []),
    input.primaryDocumentId,
    ...(input.extraDocumentIds ?? []),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  return new Set(ids);
}
