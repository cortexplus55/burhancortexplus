/**
 * Exam Graph adapter — reads existing document_topic_nodes + exam_prep_topics.
 * Does not re-send PDFs to GPT.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import type { SourceRef } from "@/lib/adaptive/types";

export type ExamGraphTopic = {
  topicId: string;
  topicKey: string;
  title: string;
  prerequisites: string[];
  importance: "important" | "medium" | "less";
  weightPercent: number | null;
  pageNumbers: number[];
  sourceRefs: SourceRef[];
  documentTopicNodeId: string | null;
  measuredLevel: string | null;
};

export type ExamGraph = {
  examPrepId: string;
  topics: ExamGraphTopic[];
  edges: { fromKey: string; toKey: string; kind: "prerequisite" | "related" }[];
};

type PrepTopicRow = {
  id: string;
  label: string | null;
  document_topic_node_id?: string | null;
  measured_level?: string | null;
  source_refs?: unknown;
};

export async function loadExamGraph(
  service: SupabaseClient,
  examPrepId: string,
): Promise<ExamGraph> {
  const { data: topics } = await service
    .from("exam_prep_topics")
    .select(
      "id, label, document_topic_node_id, measured_level, source_refs",
    )
    .eq("exam_prep_id", examPrepId)
    .order("sort_order", { ascending: true });

  const rows = (topics ?? []) as PrepTopicRow[];
  const nodeIds = rows
    .map((r) => r.document_topic_node_id)
    .filter((id): id is string => Boolean(id));

  const nodeMeta = new Map<
    string,
    { prerequisites: string[]; pages: number[] }
  >();
  if (nodeIds.length) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("id, prerequisites")
      .in("id", nodeIds);
    for (const n of nodes ?? []) {
      const prereqs = Array.isArray(n.prerequisites)
        ? (n.prerequisites as unknown[])
            .map((p) => String(p ?? "").trim())
            .filter(Boolean)
        : [];
      nodeMeta.set(n.id as string, { prerequisites: prereqs, pages: [] });
    }

    const { data: links } = await service
      .from("document_topic_page_links")
      .select("topic_id, page_number")
      .in("topic_id", nodeIds);
    for (const link of links ?? []) {
      const id = link.topic_id as string;
      const page = Number(link.page_number);
      const entry = nodeMeta.get(id) ?? { prerequisites: [], pages: [] };
      if (Number.isFinite(page)) entry.pages.push(page);
      nodeMeta.set(id, entry);
    }
  }

  const graphTopics: ExamGraphTopic[] = rows.map((row) => {
    const title = String(row.label ?? "").trim() || "Konu";
    const topicKey = normalizeTopicKey(title);
    const node = row.document_topic_node_id
      ? nodeMeta.get(row.document_topic_node_id)
      : undefined;
    const sourceRefs = parseSourceRefs(row.source_refs);
    const pagesFromSources = sourceRefs
      .map((s) => s.page)
      .filter((p): p is number => typeof p === "number");
    const pageNumbers = [
      ...new Set([...(node?.pages ?? []), ...pagesFromSources]),
    ].sort((a, b) => a - b);

    return {
      topicId: row.id,
      topicKey,
      title,
      prerequisites: node?.prerequisites ?? [],
      importance: "medium",
      weightPercent: null,
      pageNumbers,
      sourceRefs,
      documentTopicNodeId: row.document_topic_node_id ?? null,
      measuredLevel: row.measured_level ?? null,
    };
  });

  const keySet = new Set(graphTopics.map((t) => t.topicKey));
  const edges: ExamGraph["edges"] = [];
  for (const t of graphTopics) {
    for (const p of t.prerequisites) {
      const fromKey = normalizeTopicKey(p);
      if (keySet.has(fromKey) && fromKey !== t.topicKey) {
        edges.push({ fromKey, toKey: t.topicKey, kind: "prerequisite" });
      }
    }
  }

  return { examPrepId, topics: graphTopics, edges };
}

function parseSourceRefs(raw: unknown): SourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const pages = Array.isArray(o.pages)
      ? o.pages.filter((p): p is number => typeof p === "number")
      : [];
    out.push({
      documentId:
        typeof o.documentId === "string"
          ? o.documentId
          : typeof o.document_id === "string"
            ? o.document_id
            : undefined,
      chunkId:
        typeof o.chunkId === "string"
          ? o.chunkId
          : typeof o.chunk_id === "string"
            ? o.chunk_id
            : undefined,
      page:
        typeof o.page === "number"
          ? o.page
          : pages[0],
      label: typeof o.fileName === "string" ? o.fileName : undefined,
    });
  }
  return out;
}

/** Prerequisite readiness: all named prereqs mastered or missing from graph. */
export function prerequisitesMet(
  graph: ExamGraph,
  topicKey: string,
  masteryByKey: Map<string, { mastery: number; status: string }>,
  threshold = 0.55,
): boolean {
  const topic = graph.topics.find((t) => t.topicKey === topicKey);
  if (!topic) return true;
  for (const p of topic.prerequisites) {
    const key = normalizeTopicKey(p);
    if (!graph.topics.some((t) => t.topicKey === key)) continue;
    const m = masteryByKey.get(key);
    if (!m || m.mastery < threshold) return false;
  }
  return true;
}
