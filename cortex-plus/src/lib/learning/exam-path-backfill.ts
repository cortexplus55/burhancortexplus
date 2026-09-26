import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";

export type BackfillNode = {
  id: string;
  kind: string;
  title: string;
  dayIndex: number;
  sortOrder: number;
  status: NodeStatus;
  sessionMeta?: Record<string, unknown> | null;
};

export type BackfillInsert = {
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
  status: NodeStatus;
  sessionMeta: Record<string, unknown> | null;
};

const SPECS: { kind: PlanNodeKind; after: string[] }[] = [
  { kind: "focused", after: ["gaps", "spaced", "oral"] },
  { kind: "final_check", after: ["flashcards", "written_exam"] },
  { kind: "readiness", after: ["final_check", "flashcards"] },
];

function copyMeta(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return null;
  const copy: Record<string, unknown> = { ...meta };
  if (Array.isArray(meta.sourcePages)) copy.sourcePages = [...meta.sourcePages];
  return copy;
}

function hasMeta(meta: Record<string, unknown> | null | undefined) {
  return Boolean(meta && Object.keys(meta).length > 0);
}

/** Çapa boşsa en yakın dolu oturum metasını alır; sayfa listesi kopyalanır. */
function nearestMeta(
  nodes: { sessionMeta: Record<string, unknown> | null }[],
  anchorIndex: number,
): Record<string, unknown> | null {
  if (hasMeta(nodes[anchorIndex]?.sessionMeta)) return copyMeta(nodes[anchorIndex].sessionMeta);
  for (let distance = 1; distance < nodes.length; distance += 1) {
    const after = nodes[anchorIndex + distance];
    const before = nodes[anchorIndex - distance];
    if (hasMeta(after?.sessionMeta)) return copyMeta(after.sessionMeta);
    if (hasMeta(before?.sessionMeta)) return copyMeta(before.sessionMeta);
  }
  return null;
}

/**
 * Eski hazırlıklara eksik düğümleri birer kez ekler.
 * Öğrenci o noktayı geçtiyse yeni düğüm kilitli kalmaz; sonraki düğümler kapanmaz.
 */
export function planPathBackfill(nodes: BackfillNode[]): {
  sortUpdates: { id: string; sortOrder: number }[];
  inserts: BackfillInsert[];
} {
  if (!nodes.length) return { sortUpdates: [], inserts: [] };
  const working = nodes
    .map((node) => ({ ...node, sessionMeta: copyMeta(node.sessionMeta) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const original = new Map(working.map((node) => [node.id, node.sortOrder]));
  const inserts: BackfillInsert[] = [];

  for (const spec of SPECS) {
    if (working.some((node) => node.kind === spec.kind)) continue;
    let anchorIndex = -1;
    for (const kind of spec.after) {
      for (let index = working.length - 1; index >= 0; index -= 1) {
        if (working[index].kind === kind) {
          anchorIndex = index;
          break;
        }
      }
      if (anchorIndex >= 0) break;
    }
    if (anchorIndex < 0) anchorIndex = working.length - 1;
    const anchor = working[anchorIndex];
    const passed = working
      .slice(anchorIndex + 1)
      .some((node) => node.status === "ready" || node.status === "done");
    const status: NodeStatus = passed || anchor.status === "done" ? "ready" : "locked";
    const sortOrder = anchor.sortOrder + 1;
    for (const node of working) {
      if (node.sortOrder >= sortOrder) node.sortOrder += 1;
    }
    const inserted: BackfillNode & { sessionMeta: Record<string, unknown> | null } = {
      id: `new:${spec.kind}`,
      kind: spec.kind,
      title: PLAN_NODE_META[spec.kind].title,
      dayIndex: anchor.dayIndex,
      sortOrder,
      status,
      sessionMeta: nearestMeta(working, anchorIndex),
    };
    working.push(inserted);
    working.sort((a, b) => a.sortOrder - b.sortOrder);
    inserts.push({
      kind: spec.kind,
      title: inserted.title,
      dayIndex: inserted.dayIndex,
      sortOrder: inserted.sortOrder,
      status: inserted.status,
      sessionMeta: inserted.sessionMeta ?? null,
    });
  }

  const sortUpdates = working
    .filter((node) => !node.id.startsWith("new:") && original.get(node.id) !== node.sortOrder)
    .map((node) => ({ id: node.id, sortOrder: node.sortOrder }));
  return { sortUpdates, inserts };
}
