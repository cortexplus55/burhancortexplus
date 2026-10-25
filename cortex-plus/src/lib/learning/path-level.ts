/**
 * Yolun başındaki seviye tespiti (P2-2).
 * Tanı bitmemişse düğüm tıklanır ve `/tanisma` açar. Bitmişse ya da bu hazırlıkta
 * tanı yoksa sahte düğüm ve yüzen AB/CD çizilmez.
 */

export const LEVEL_NODE_ID = "__intro";

export function shouldShowLevelNode(introCompletedAt: string | null | undefined): boolean {
  return !introCompletedAt;
}

export function isLevelNode(id: string | null | undefined): boolean {
  return id === LEVEL_NODE_ID;
}

/** Erişilebilirlik metni etkinliğin türünü "Konu testi" diye yalanlamaz. */
export function levelNodeAria(statusAria: string): string {
  return `Seviye tespiti, ${statusAria}`;
}
