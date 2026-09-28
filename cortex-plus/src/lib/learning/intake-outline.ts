import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsolidatedTopic } from "@/lib/learning/cross-material-topics";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";
import {
  examWeightToEmphasis,
  isHighExamWeight,
  readCourseFromRelations,
  unpackTopicPerspective,
} from "@/lib/documents/outline-topic-meta";

export type IntakeStudyUnit = { title: string; topicIndexes: number[] };

type IntakeNode = Record<string, unknown> & { documentId: string; fileName: string };

const bySortOrder = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  (typeof a.sort_order === "number" ? a.sort_order : 0) -
  (typeof b.sort_order === "number" ? b.sort_order : 0);

/**
 * Load outline maps without consolidate/reorder. Files outlined together
 * (unit nodes tagged with the same course) merge back into that ONE order;
 * otherwise each file's map follows the previous one. Returns null when any
 * document is still flat/legacy so the caller can fall back.
 */
export async function loadOneshotIntakeTopics(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<{ topics: ConsolidatedTopic[]; units: IntakeStudyUnit[] } | null> {
  if (!documentIds.length) return null;
  const perDoc: IntakeNode[][] = [];
  const pagesByTopic = new Map<string, number[]>();
  for (const documentId of documentIds) {
    const { data: doc } = await service
      .from("documents")
      .select("id, file_name, topic_map_status")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc || (doc.topic_map_status !== "ready" && doc.topic_map_status !== "reviewed")) {
      return null;
    }
    const fileName = (doc.file_name as string | null) ?? "";
    const nodeRows = await loadPagedDocumentRows(
      service,
      "document_topic_nodes",
      "id, title, parent_id, sort_order, prerequisites, learning_objective, key_definitions, key_relations, document_id",
      [documentId],
      ["sort_order", "id"],
    );
    perDoc.push(nodeRows.map((n) => ({ ...n, documentId, fileName })));
    const links = await loadPagedDocumentRows(
      service,
      "document_topic_page_links",
      "topic_id, page_number, document_id",
      [documentId],
      ["topic_id", "page_number"],
    );
    for (const link of links) {
      const list = pagesByTopic.get(link.topic_id as string) ?? [];
      list.push(link.page_number as number);
      pagesByTopic.set(link.topic_id as string, list);
    }
  }

  const courseId = documentIds[0];
  const isCourse =
    documentIds.length > 1 &&
    perDoc.some((nodes) => nodes.length) &&
    perDoc.every(
      (nodes) =>
        !nodes.length ||
        nodes.some((n) => n.parent_id == null && readCourseFromRelations(n.key_relations) === courseId),
    );
  if (!isCourse && perDoc.some((nodes) => !nodes.some((n) => n.parent_id != null))) return null;

  const topics: ConsolidatedTopic[] = [];
  const units: IntakeStudyUnit[] = [];
  for (const nodes of isCourse ? [perDoc.flat()] : perDoc) {
    const parentIds = new Set(nodes.map((n) => n.parent_id).filter(Boolean) as string[]);
    const leaves = nodes.filter((n) => !parentIds.has(n.id as string)).sort(bySortOrder);
    if (!leaves.length || leaves.length > 40) return null;
    // A course unit spanning files is stored once per file with the same order.
    const unitByOrder = new Map<number, { title: string; ids: Set<string> }>();
    for (const parent of nodes.filter((n) => parentIds.has(n.id as string)).sort(bySortOrder)) {
      const order = typeof parent.sort_order === "number" ? parent.sort_order : 0;
      const unit = unitByOrder.get(order) ?? { title: String(parent.title ?? ""), ids: new Set() };
      unit.ids.add(parent.id as string);
      unitByOrder.set(order, unit);
    }
    const baseIndex = topics.length;
    for (const leaf of leaves) {
      const perspective = unpackTopicPerspective({
        learning_objective: leaf.learning_objective as string | null,
        prerequisites: leaf.prerequisites,
        key_definitions: leaf.key_definitions,
        key_relations: leaf.key_relations,
      });
      const pages = [...new Set(pagesByTopic.get(leaf.id as string) ?? [])].sort((a, b) => a - b);
      const emphasis = examWeightToEmphasis(perspective.examWeight);
      topics.push({
        title: String(leaf.title ?? ""),
        summary: (perspective.whyLearn ?? "").slice(0, 400),
        sections: [],
        pages,
        sources: [{ documentId: leaf.documentId, fileName: leaf.fileName, pages, nodeId: leaf.id as string }],
        sourceCount: 1,
        prerequisites: perspective.prerequisiteTitles,
        weightPercent: null,
        examHeavy: isHighExamWeight(perspective.examWeight),
        importance: emphasis === "core" ? "important" : emphasis === "skim" ? "less" : "medium",
        scopeNote: null,
        commonMistakes: [],
        practiceItems: [],
        nodeIds: [leaf.id as string],
        syllabusIndex: null,
      });
    }
    for (const unit of unitByOrder.values()) {
      const topicIndexes = leaves
        .map((leaf, i) => (unit.ids.has(leaf.parent_id as string) ? baseIndex + i : -1))
        .filter((i) => i >= 0);
      if (topicIndexes.length) units.push({ title: unit.title, topicIndexes });
    }
  }
  if (!topics.length) return null;
  return { topics, units };
}
