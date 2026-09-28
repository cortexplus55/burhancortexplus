import {
  cleanOutlineDeterministic,
  foldOutlineKey,
} from "@/lib/documents/outline-clean";
import { pickStudyTopics } from "@/lib/learning/diagnostic";
import type { ConsolidatedTopic } from "@/lib/learning/cross-material-topics";

export type StudyOutlineTopic = {
  id: string;
  title: string;
  pages: number[];
  sourceNodeIds: string[];
};

export type StudyOutlineUnit = { title: string; topicIndexes: number[] };

export type StudyOutline = { topics: StudyOutlineTopic[]; units: StudyOutlineUnit[] };

type OutlineNode = {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
};

/**
 * Brand / series tokens from a file basename (e.g. KPSS, TYT) — not exam-specific.
 */
export function seriesLabelFromFileName(fileName: string): string[] {
  const base =
    fileName
      .replace(/\.[^.]+$/, "")
      .split(/[/\\]/)
      .pop() ?? "";
  const tokens: string[] = [];
  const hyphenParts = base.split(/[-–—]/).map((p) => p.trim());
  for (const part of hyphenParts) {
    const m = part.match(/^([A-ZÇĞİÖŞÜ]{2,12})\b/);
    if (m) tokens.push(m[1]!);
  }
  const first = base.trim().split(/\s+/)[0] ?? "";
  if (/^[A-ZÇĞİÖŞÜ]{2,12}$/.test(first)) tokens.push(first);
  return [...new Set(tokens)];
}

function matchNodesForKept(
  keptTitle: string,
  sourceTitle: string,
  nodes: OutlineNode[],
): OutlineNode[] {
  const keyKept = foldOutlineKey(keptTitle);
  const keySource = foldOutlineKey(sourceTitle);
  const exactSource = nodes.filter((n) => foldOutlineKey(n.title) === keySource);
  if (exactSource.length) return exactSource;
  const exactTitle = nodes.filter((n) => foldOutlineKey(n.title) === keyKept);
  if (exactTitle.length) return exactTitle;
  return nodes.filter((n) => {
    const keyNode = foldOutlineKey(n.title);
    return keyNode.includes(keyKept) || keyKept.includes(keyNode);
  });
}

function primaryNodeId(nodes: OutlineNode[]): string {
  const sorted = [...nodes].sort((a, b) => b.title.length - a.title.length);
  return sorted[0]!.id;
}

function unionPages(
  nodeIds: string[],
  pagesByTopic: Map<string, number[]>,
  extra: number[],
): number[] {
  const set = new Set<number>(extra);
  for (const id of nodeIds) {
    for (const p of pagesByTopic.get(id) ?? []) set.add(p);
  }
  return [...set].sort((a, b) => a - b);
}

export function buildStudyOutlineFromNodes(input: {
  nodes: OutlineNode[];
  pagesByTopic: Map<string, number[]>;
  seriesLabels?: string[];
  unitRuns?: { label: string; pageNumbers: number[] }[];
  tocUnits?: { title: string; startPage: number }[];
  contentPageCount?: number;
  language?: "tr" | "en" | "unknown";
}): StudyOutline {
  const nodes = [...input.nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  const pagesByTopic = input.pagesByTopic;
  const hasHierarchy = nodes.some((n) => n.parentId);

  if (hasHierarchy) {
    const study = pickStudyTopics(nodes);
    const topics: StudyOutlineTopic[] = study.map((s) => ({
      id: s.id,
      title: s.title,
      pages: unionPages([s.id], pagesByTopic, []),
      sourceNodeIds: [s.id],
    }));
    const units: StudyOutlineUnit[] = [];
    const parents = nodes
      .filter((n) => nodes.some((c) => c.parentId === n.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const parent of parents) {
      const topicIndexes = topics
        .map((t, index) => (study[index]?.parentId === parent.id ? index : -1))
        .filter((index) => index >= 0);
      if (topicIndexes.length) {
        units.push({ title: parent.title, topicIndexes });
      }
    }
    return { topics, units };
  }

  const cleaned = cleanOutlineDeterministic({
    titles: nodes.map((n) => ({
      title: n.title,
      pageNumbers: [...new Set(pagesByTopic.get(n.id) ?? [])].sort((a, b) => a - b),
    })),
    seriesLabels: input.seriesLabels,
    unitRuns: input.unitRuns,
    tocUnits: input.tocUnits,
    contentPageCount: input.contentPageCount,
    language: input.language,
  });

  const topics: StudyOutlineTopic[] = [];
  for (const kept of cleaned.kept) {
    const matched = matchNodesForKept(kept.title, kept.sourceTitle, nodes);
    if (!matched.length) continue;
    const sourceNodeIds = matched.map((n) => n.id);
    const id = primaryNodeId(matched);
    topics.push({
      id,
      title: kept.title,
      pages: unionPages(sourceNodeIds, pagesByTopic, kept.pageNumbers),
      sourceNodeIds,
    });
  }

  const units = cleaned.units
    .map((unit) => ({
      title: unit.title,
      topicIndexes: unit.topicIndexes.filter((i) => i >= 0 && i < cleaned.kept.length),
    }))
    .map((unit) => ({
      title: unit.title,
      topicIndexes: unit.topicIndexes
        .map((keptIndex) => {
          const kept = cleaned.kept[keptIndex];
          if (!kept) return -1;
          return topics.findIndex(
            (t) => foldOutlineKey(t.title) === foldOutlineKey(kept.title),
          );
        })
        .filter((i) => i >= 0),
    }))
    .filter((unit) => unit.topicIndexes.length > 0);

  return { topics, units };
}

/**
 * Map unit topic indexes from a per-document outline into consolidated topic order.
 */
export function remapStudyUnitsToConsolidated(
  units: StudyOutlineUnit[],
  outlineTopics: StudyOutlineTopic[],
  consolidated: ConsolidatedTopic[],
): StudyOutlineUnit[] {
  const indexByNodeId = new Map<string, number>();
  consolidated.forEach((topic, index) => {
    for (const nodeId of topic.nodeIds) indexByNodeId.set(nodeId, index);
  });

  const resolveIndex = (outlineTopic: StudyOutlineTopic): number | null => {
    for (const id of [outlineTopic.id, ...outlineTopic.sourceNodeIds]) {
      const hit = indexByNodeId.get(id);
      if (hit !== undefined) return hit;
    }
    const key = foldOutlineKey(outlineTopic.title);
    const byTitle = consolidated.findIndex((t) => foldOutlineKey(t.title) === key);
    return byTitle >= 0 ? byTitle : null;
  };

  const remapped: StudyOutlineUnit[] = [];
  for (const unit of units) {
    const topicIndexes: number[] = [];
    for (const outlineIndex of unit.topicIndexes) {
      const outlineTopic = outlineTopics[outlineIndex];
      if (!outlineTopic) continue;
      const consolidatedIndex = resolveIndex(outlineTopic);
      if (consolidatedIndex !== null && !topicIndexes.includes(consolidatedIndex)) {
        topicIndexes.push(consolidatedIndex);
      }
    }
    if (topicIndexes.length) {
      remapped.push({ title: unit.title, topicIndexes });
    }
  }
  return remapped;
}
