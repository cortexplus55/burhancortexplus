import { PLAN_PHASES, phaseForKind } from "@/lib/learning/exam-plan-phases";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Çalışma yolunu konu (yoksa aşama) kartlarına böler (25 Ekim 2026).
 * Yalnız üzerinde çalışılan kart açık kalır; biten ve ilerideki kartlar
 * kapalıdır. Böylece bütün kilitli düğümler tek sayfada uzamaz.
 */
export type PathSectionNode = {
  id: string;
  kind: PlanNodeKind;
  sortOrder: number;
  status: string;
  sessionMeta?: { topicTitle?: string | null } | null;
};

export type PathSection<T extends PathSectionNode> = {
  id: string;
  title: string;
  nodes: T[];
  done: number;
  total: number;
  active: boolean;
  locked: boolean;
  complete: boolean;
};

function topicKey(title: string): string {
  return title.trim().toLocaleLowerCase("tr-TR");
}

export function buildPathSections<T extends PathSectionNode>(
  nodes: readonly T[],
  currentId: string | null,
): PathSection<T>[] {
  const ordered = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder);
  let introPlaced = false;
  const groups: { key: string; id: string; title: string; nodes: T[] }[] = [];
  for (const node of ordered) {
    const topic = node.sessionMeta?.topicTitle?.trim();
    let key: string;
    let title: string;
    if (topic) {
      key = `topic:${topicKey(topic)}`;
      title = topic;
    } else {
      let phaseId = phaseForKind(node.kind);
      if (node.kind === "lesson" && !introPlaced) {
        phaseId = "start";
        introPlaced = true;
      } else if (node.kind === "lesson") {
        introPlaced = true;
      }
      const phase = PLAN_PHASES.find((item) => item.id === phaseId);
      key = `phase:${phaseId}`;
      title = phase?.title ?? "Çalışma";
    }
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.nodes.push(node);
    else groups.push({ key, id: `${key}:${groups.length}`, title, nodes: [node] });
  }
  return groups.map((group) => {
    const done = group.nodes.filter((node) => node.status === "done").length;
    const total = group.nodes.length;
    return {
      id: group.id,
      title: group.title,
      nodes: group.nodes,
      done,
      total,
      active: group.nodes.some((node) => node.id === currentId),
      locked: total > 0 && group.nodes.every((node) => node.status === "locked"),
      complete: total > 0 && done === total,
    };
  });
}

export function sectionMasteryPct(
  nodes: readonly { id: string; status: string }[],
  scores: Record<string, number>,
): number | null {
  const values = nodes
    .filter((node) => node.status === "done")
    .map((node) => scores[node.id])
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Kart başlığındaki "4 adım · Tamamlandı" satırı. */
export function sectionStatusLine(
  section: Pick<PathSection<PathSectionNode>, "done" | "total" | "locked" | "complete" | "active">,
  masteryPct: number | null,
): string {
  const count = `${section.total} adım`;
  if (section.complete) {
    return masteryPct != null ? `${count} · Tamamlandı · %${masteryPct}` : `${count} · Tamamlandı`;
  }
  if (section.locked) return `${count} · Kilitli`;
  if (section.active) return `${count} · Devam ediyor`;
  if (section.done > 0) return `${count} · ${section.done}/${section.total} tamam`;
  return `${count} · Sırada`;
}
