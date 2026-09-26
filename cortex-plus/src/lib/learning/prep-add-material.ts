import {
  type MergedTopic,
  type TopicSourceRef,
  topicMatchKey,
} from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import {
  type TopicContradiction,
  formatContradictions,
} from "@/lib/learning/source-contradictions";

/**
 * Var olan hazırlığa yeni dosya ekleme.
 *
 * Bitmiş düğüm, deneme, puan ve hazırlık skoru silinmez ve sıfırlanmaz.
 * Eski dosyalar yeniden analiz edilmez. Yeni konu yola eklenir; aynı konu
 * yeni kaynağı alır.
 */

export type ExistingPrepTopic = {
  id: string;
  label: string;
  sortOrder: number;
  status: string;
  sourceRefs: TopicSourceRef[];
};

export type ExistingPrepNode = {
  id: string;
  title: string;
  sortOrder: number;
  status: string;
  kind: string;
  dayIndex: number;
};

export type AddMaterialPlan = {
  sourceDocumentIds: string[];
  topicUpdates: {
    id: string;
    sourceRefs: TopicSourceRef[];
    contradictions: TopicContradiction[];
    warning: string;
  }[];
  topicInserts: {
    label: string;
    sortOrder: number;
    sourceRefs: TopicSourceRef[];
    contradictions: TopicContradiction[];
    warning: string;
    status: "ready";
  }[];
  topicSortUpdates: { id: string; sortOrder: number }[];
  nodeInserts: {
    title: string;
    kind: "lesson";
    sortOrder: number;
    dayIndex: number;
    status: "locked" | "ready";
    topicTitle: string;
  }[];
  nodeSortUpdates: { id: string; sortOrder: number }[];
  keptTopicStatuses: { id: string; status: string }[];
  keptNodeStatuses: { id: string; status: string }[];
  readinessScore: number;
};

function dedupeSources(sources: TopicSourceRef[]): TopicSourceRef[] {
  const out: TopicSourceRef[] = [];
  for (const source of sources) {
    const have = out.find((item) => item.documentId && item.documentId === source.documentId);
    if (!have) {
      out.push({ ...source, pages: [...source.pages] });
      continue;
    }
    const pages = new Set([...have.pages, ...source.pages]);
    have.pages = [...pages].sort((a, b) => a - b);
    if (!have.fileName && source.fileName) have.fileName = source.fileName;
    if (!have.nodeId && source.nodeId) have.nodeId = source.nodeId;
  }
  return out;
}

function placeIncoming(
  existing: ExistingPrepTopic[],
  incoming: MergedTopic[],
): { label: string; sortOrder: number; id: string | null }[] {
  const placed = existing.map((topic) => ({
    id: topic.id as string | null,
    label: topic.label,
    sortOrder: topic.sortOrder,
  }));
  const ordered = orderTopicsForPath(incoming, { manualOrder: false });
  for (const topic of ordered) {
    let after = -1;
    for (const prereq of topic.prerequisites) {
      const key = topicMatchKey(prereq);
      const hit = placed.find((row) => topicMatchKey(row.label) === key);
      if (hit && hit.sortOrder > after) after = hit.sortOrder;
    }
    const at =
      after < 0 ? placed.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1 : after + 1;
    for (const row of placed) {
      if (row.sortOrder >= at) row.sortOrder += 1;
    }
    placed.push({ id: null, label: topic.title, sortOrder: at });
  }
  return placed;
}

export function planAddedMaterial(input: {
  existingTopics: ExistingPrepTopic[];
  existingNodes: ExistingPrepNode[];
  incoming: MergedTopic[];
  existingDocumentIds: string[];
  newDocumentId: string;
  contradictionsByTitle: Map<string, TopicContradiction[]>;
  readinessScore: number;
}): AddMaterialPlan {
  const sourceDocumentIds = [...input.existingDocumentIds];
  if (input.newDocumentId && !sourceDocumentIds.includes(input.newDocumentId)) {
    sourceDocumentIds.push(input.newDocumentId);
  }

  const byKey = new Map(
    input.existingTopics.map((topic) => [topicMatchKey(topic.label), topic]),
  );
  const fresh: MergedTopic[] = [];
  const topicUpdates: AddMaterialPlan["topicUpdates"] = [];

  for (const topic of input.incoming) {
    const have = byKey.get(topicMatchKey(topic.title));
    const contradictions = input.contradictionsByTitle.get(topic.title) ?? [];
    if (!have) {
      fresh.push(topic);
      continue;
    }
    topicUpdates.push({
      id: have.id,
      sourceRefs: dedupeSources([...have.sourceRefs, ...topic.sources]),
      contradictions,
      warning: formatContradictions(contradictions),
    });
  }

  const placed = placeIncoming(input.existingTopics, fresh);
  const sortById = new Map(
    placed.filter((row) => row.id).map((row) => [row.id as string, row.sortOrder]),
  );
  const topicSortUpdates = input.existingTopics
    .filter((topic) => sortById.get(topic.id) !== topic.sortOrder)
    .map((topic) => ({ id: topic.id, sortOrder: sortById.get(topic.id) ?? topic.sortOrder }));

  const topicInserts: AddMaterialPlan["topicInserts"] = fresh.map((topic) => {
    const row = placed.find((item) => item.id == null && item.label === topic.title);
    const contradictions = input.contradictionsByTitle.get(topic.title) ?? [];
    return {
      label: topic.title,
      sortOrder: row?.sortOrder ?? placed.length,
      sourceRefs: dedupeSources(topic.sources),
      contradictions,
      warning: formatContradictions(contradictions),
      status: "ready" as const,
    };
  });

  const allDone =
    input.existingNodes.length > 0 &&
    input.existingNodes.every((node) => node.status === "done");
  const dayIndex = input.existingNodes.reduce((max, node) => Math.max(max, node.dayIndex), 0);
  const virtual = input.existingNodes.map((node) => ({
    id: node.id as string | null,
    title: node.title,
    sortOrder: node.sortOrder,
    fresh: false,
  }));
  const orderedFresh = orderTopicsForPath(fresh, { manualOrder: false });
  let readyGiven = false;
  for (const topic of orderedFresh) {
    let after = -1;
    for (const prereq of topic.prerequisites) {
      const key = topicMatchKey(prereq);
      for (const node of virtual) {
        if (topicMatchKey(node.title) === key && node.sortOrder > after) after = node.sortOrder;
      }
    }
    const at =
      after < 0
        ? virtual.reduce((max, node) => Math.max(max, node.sortOrder), -1) + 1
        : after + 1;
    for (const node of virtual) {
      if (node.sortOrder >= at) node.sortOrder += 1;
    }
    virtual.push({ id: null, title: topic.title, sortOrder: at, fresh: true });
  }
  const nodeSortUpdates = input.existingNodes.flatMap((node) => {
    const next = virtual.find((item) => item.id === node.id);
    if (!next || next.sortOrder === node.sortOrder) return [];
    return [{ id: node.id, sortOrder: next.sortOrder }];
  });
  const nodeInserts: AddMaterialPlan["nodeInserts"] = virtual
    .filter((node) => node.fresh)
    .map((node) => {
      const open = input.existingNodes.length === 0 || allDone;
      const status = open && !readyGiven ? "ready" : "locked";
      if (status === "ready") readyGiven = true;
      return {
        title: node.title,
        kind: "lesson" as const,
        sortOrder: node.sortOrder,
        dayIndex,
        status,
        topicTitle: node.title,
      };
    });

  return {
    sourceDocumentIds,
    topicUpdates,
    topicInserts,
    topicSortUpdates,
    nodeInserts,
    nodeSortUpdates,
    keptTopicStatuses: input.existingTopics.map((topic) => ({
      id: topic.id,
      status: topic.status,
    })),
    keptNodeStatuses: input.existingNodes.map((node) => ({
      id: node.id,
      status: node.status,
    })),
    readinessScore: input.readinessScore,
  };
}
