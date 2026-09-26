import type { PlanNodeKind, NodeStatus } from "@/lib/learning/exam-prep-plan";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";

const PREP_WIDE = new Set<PlanNodeKind>([
  "gaps",
  "focused",
  "written_exam",
  "flashcards",
  "final_check",
  "readiness",
  "spaced",
]);

/** Kart ~20 sn; Hazırsın ~3 dk; son kontrol konu başı ~3 dk. */
export function estimateNodeMinutes(
  kind: PlanNodeKind,
  meta: { durationMinutes?: number } | null | undefined,
  opts?: { cardCount?: number; topicCount?: number },
): number | null {
  if (kind === "readiness") return 3;
  if (kind === "flashcards" || kind === "spaced") {
    const cards = opts?.cardCount ?? 12;
    return Math.max(2, Math.ceil((cards * 20) / 60));
  }
  if (kind === "final_check") {
    const topics = Math.max(1, opts?.topicCount ?? 3);
    return Math.max(5, topics * 3);
  }
  if (meta?.durationMinutes && meta.durationMinutes > 0) return meta.durationMinutes;
  if (kind === "lesson") return 5;
  return null;
}

export function trailMetaLine(
  node: {
    kind: PlanNodeKind;
    status: NodeStatus;
    sessionMeta?: {
      sourcePages?: number[];
      durationMinutes?: number;
      role?: string;
    } | null;
  },
  opts: {
    topicCount?: number;
    readinessClaim?: boolean | null;
    cardCount?: number;
  } = {},
): string {
  const parts: string[] = [PLAN_NODE_META[node.kind].title];
  const minutes = estimateNodeMinutes(node.kind, node.sessionMeta, {
    cardCount: opts.cardCount,
    topicCount: opts.topicCount,
  });

  if (node.kind === "flashcards" || node.kind === "spaced") {
    const cards = opts.cardCount ?? 12;
    parts.push(`${cards} kart`);
    if (minutes) parts.push(`~${minutes} dk`);
  } else if (node.kind === "readiness") {
    parts.push("eksikler bu ekranda");
    parts.push("~3 dk");
  } else if (node.kind === "final_check") {
    const n = opts.topicCount && opts.topicCount > 1 ? opts.topicCount : null;
    if (n) parts.push(`${n} konu`);
    if (minutes) parts.push(`~${minutes} dk`);
  } else {
    if (minutes) parts.push(`${minutes} dk`);
    // Tek konulu öğelerde sayfa; prep-wide / çok konulu → "N konu"
    if (PREP_WIDE.has(node.kind)) {
      if (opts.topicCount && opts.topicCount > 1) {
        parts.push(`${opts.topicCount} konu`);
      }
    } else if (node.sessionMeta?.sourcePages?.length) {
      parts.push(`s.${node.sessionMeta.sourcePages.slice(0, 4).join(",")}`);
    }
  }

  if (node.status === "locked") parts.push("önerilen sırada");
  if (node.kind === "written_exam") parts.push("yardım yok");
  if (node.kind === "readiness" && opts.readinessClaim === true) {
    // "eksikler" satırını ölçülen hazır ile değiştirme — başlık zaten Hazırsın?
  }

  return parts.join(" · ");
}
