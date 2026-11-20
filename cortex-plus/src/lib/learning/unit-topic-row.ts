import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";

/**
 * Ana ünite satırı (Faz 10, 20 Kasım 2026): `exam_prep_topics` satırı bir ana ünitedir; ince konular `subtopics`
 * (jsonb string[]) ve `source_refs` yaprak başına (belge + düğüm) yazılır. Eski satırda alt başlık yoktur: bugünkü gibi
 * okunur. Göç uygulanmadan yazılan ünite satırı alt başlık taşımaz; o hazırlıkta ünite bilgisi düğümlerin
 * `session_meta.lessonSubtopics` / `unitSources` alanlarındadır (göç gerektirmez).
 */

export function parseSubtopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const title = item.trim();
    if (title && !out.includes(title)) out.push(title);
  }
  return out;
}

export function isUnitTopicRow(row: { subtopics?: unknown }): boolean {
  return parseSubtopics(row.subtopics).length > 0;
}

/** Satırın belge başına sayfaları (yapraklar birleşir, kaynak sırası korunur). */
export function unitRowDocumentSources(row: { source_refs?: unknown }): { documentId: string; pages: number[] }[] {
  const byDoc = new Map<string, Set<number>>();
  for (const ref of parseTopicSourceRefs(row.source_refs)) {
    const set = byDoc.get(ref.documentId) ?? new Set<number>();
    for (const page of ref.pages) set.add(page);
    byDoc.set(ref.documentId, set);
  }
  return [...byDoc]
    .map(([documentId, pages]) => ({ documentId, pages: [...pages].sort((a, b) => a - b) }))
    .filter((ref) => ref.pages.length);
}

/** Düğümlerden ünite modeli: herhangi bir düğüm ana ünite alanı taşıyorsa (göçten önce kurulan hazırlık dahil). */
export function nodesUseUnits(nodes: readonly { session_meta?: unknown }[]): boolean {
  return nodes.some((node) => {
    const meta = node.session_meta;
    if (!meta || typeof meta !== "object") return false;
    const row = meta as { lessonSubtopics?: unknown; unitSources?: unknown };
    return (Array.isArray(row.lessonSubtopics) && row.lessonSubtopics.length > 0) || (Array.isArray(row.unitSources) && row.unitSources.length > 0);
  });
}
