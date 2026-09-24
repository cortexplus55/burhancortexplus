/**
 * Hazırlığın kapsamı birden fazla belgenin öğretmen analizinden kurulur.
 *
 * Öncelik dersi silmez: önemli olan önce ve derin, daha az önemli olan
 * sonra ve kısa. Hazır satır yeniden üretilmez; liste saklı analizden okunur.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import {
  coverageChecklist,
  findAnalysisTopic,
  schedulePriorityRank,
  type CoverageItem,
  type TeacherAnalysis,
  type TeachingPriority,
} from "@/lib/learning/teacher-brain";

export type PrepDocumentRow = {
  document_id?: string | null;
  source_document_ids?: string[] | null;
};

export function prepDocumentIds(row: PrepDocumentRow | null | undefined): string[] {
  if (!row) return [];
  const extra = Array.isArray(row.source_document_ids) ? row.source_document_ids : [];
  const ids = [row.document_id, ...extra].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  return [...new Set(ids)];
}

export function mergeCoverage(
  groups: { documentId: string; analysis: TeacherAnalysis }[],
): CoverageItem[] {
  return groups.flatMap((group) => coverageChecklist(group.analysis, group.documentId));
}

function topicMatches(itemTitle: string, taughtTitle: string): boolean {
  const item = foldTr(itemTitle);
  const taught = foldTr(taughtTitle);
  if (item.length < 4 || taught.length < 4) return item === taught;
  return item.includes(taught) || taught.includes(item);
}

/** Dersi olan konuların maddeleri işlendi sayılır. Kalanlar yolun borcudur. */
export function coverageRemaining(
  items: CoverageItem[],
  taughtTopicTitles: string[],
): { total: number; taught: number; remaining: CoverageItem[] } {
  const remaining = items.filter(
    (item) => !taughtTopicTitles.some((title) => topicMatches(item.topicTitle, title)),
  );
  return {
    total: items.length,
    taught: items.length - remaining.length,
    remaining,
  };
}

export function priorityForTopic(
  groups: { documentId: string; analysis: TeacherAnalysis }[],
  topicTitle: string,
): TeachingPriority | null {
  for (const group of groups) {
    const topic = findAnalysisTopic(group.analysis, topicTitle);
    if (!topic) continue;
    return topic.emphasis === "core"
      ? "important"
      : topic.emphasis === "skim"
        ? "less"
        : "medium";
  }
  return null;
}

export function schedulePriorityForTopic(
  groups: { documentId: string; analysis: TeacherAnalysis }[],
  topicTitle: string,
): number | null {
  const priority = priorityForTopic(groups, topicTitle);
  return priority ? schedulePriorityRank(priority) : null;
}

export function coverageStatusLine(items: CoverageItem[], taughtTopicTitles: string[]): string {
  const status = coverageRemaining(items, taughtTopicTitles);
  if (!status.total) return "";
  return `Kapsam: ${status.total} madde, ${status.taught} işlendi, ${status.remaining.length} kaldı.`;
}
