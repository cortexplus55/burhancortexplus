/**
 * Yolun başındaki seviye tespiti (P2-2).
 * Tanı bitmemişse düğüm tıklanır ve `/tanisma` açar. Bitmişse ya da bu hazırlıkta
 * tanı yoksa sahte düğüm ve yüzen AB/CD çizilmez.
 */

export const LEVEL_NODE_ID = "__intro";

export function shouldShowLevelNode(
  introCompletedAt: string | null | undefined,
  nodes: { status: string }[] = [],
  introDeferredAt?: string | null,
): boolean {
  if (introCompletedAt || introDeferredAt) return false;
  if (nodes.some((node) => node.status === "done")) return false;
  return nodes.length > 0;
}

export function isLevelNode(id: string | null | undefined): boolean {
  return id === LEVEL_NODE_ID;
}

/** Erişilebilirlik metni etkinliğin türünü "Konu testi" diye yalanlamaz. */
export function levelNodeAria(statusAria: string): string {
  return `Seviye tespiti, ${statusAria}`;
}
