import { PLAN_PHASES, phaseForKind } from "@/lib/learning/exam-plan-phases";
import { isCheckpointMeta, isInterludeMeta, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { FINAL_SECTION_TITLE, inFinalSection } from "@/lib/learning/final-block";

/**
 * Konu bloğunun dışında tarihiyle duran adımların bölümü (30 Ekim 2026, Paket I): uzun planın 21-45-90
 * gün sonraki tekrarları, boş haftanın bakım tekrarı ve ara kontroller. Konu bölümüne konsalar yolun
 * ortasında tek adımlık "Konu 1" bölümleri çıkıyordu.
 */
export const REVIEW_SECTION_TITLE = "🔁 Aralıklı Tekrar ve Kontrol";
export const CHECKPOINT_SECTION_TITLE = "📝 Ara Deneme / Kontrol";

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
  sessionMeta?: {
    topicTitle?: string | null;
    topicId?: string | null;
    adaptive?: unknown;
    longReview?: unknown;
    checkpoint?: unknown;
  } | null;
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
  /** Tarihe bağlı tekrar ve ara kontrol bölümü: tek konunun değil, o haftaların. */
  review?: boolean;
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
  const groups: { key: string; id: string; title: string; nodes: T[]; review?: boolean }[] = [];
  // Son konu bloğundan sonraki hazırlık geneli adımlar tek son bölümde; devraldıkları 1. konunun adını taşımaz.
  // Yolun ortasındaki hazırlık geneli adım sırasını korur ve aşama adıyla görünür.
  let lastTopicIndex = -1;
  ordered.forEach((node, index) => {
    if (!inFinalSection(node.kind, node.sessionMeta)) lastTopicIndex = index;
  });
  const finalNodes: T[] = [];
  for (const [index, node] of ordered.entries()) {
    const prepWide = inFinalSection(node.kind, node.sessionMeta);
    const topic = prepWide ? undefined : node.sessionMeta?.topicTitle?.trim();
    let key: string;
    let title: string;
    if (prepWide && index > lastTopicIndex) {
      finalNodes.push(node);
      continue;
    } else if (isInterludeMeta(node.sessionMeta)) {
      key = "interlude";
      title = REVIEW_SECTION_TITLE;
    } else if (topic) {
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
    else groups.push({ key, id: `${key}:${groups.length}`, title, nodes: [node], ...(key === "interlude" ? { review: true } : {}) });
  }
  for (const group of groups) {
    if (group.review && group.nodes.every((node) => isCheckpointMeta(node.sessionMeta))) {
      group.title = CHECKPOINT_SECTION_TITLE;
    }
  }
  if (finalNodes.length) {
    groups.push({ key: "final", id: `final:${groups.length}`, title: FINAL_SECTION_TITLE, nodes: finalNodes });
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
      ...(group.review ? { review: true } : {}),
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
  const measured = section.done > 0 && masteryPct != null ? ` · %${masteryPct}` : "";
  if (section.active) return `${count} · Devam ediyor${measured}`;
  if (section.done > 0) return `${count} · ${section.done}/${section.total} tamam${measured}`;
  return `${count} · Sırada`;
}
