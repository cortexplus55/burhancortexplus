/**
 * "2 adım ileri" (20 Ekim 2026, ürün sahibinin kararı): yol tamamıyla görünür, ama şu anki adım ve
 * sonraki iki adım kesinleşmiş plandır; sonrası öğrencinin sonuçlarına göre değişebilir, soluk
 * çizilir. Önceden yazım bu pencereyi ve 30 Ekim 2026'dan beri sıradaki iki dersi hazırlar (`prefetchTargets`).
 */
export const PATH_LOOKAHEAD = 2;

export const PATH_FAR_NOTE = "Plan sonuçlarına göre değişebilir";

/**
 * Şu anki adımdan `lookahead` adım sonrasındaki, bitmemiş adımlar. Şu anki adım yoksa hiçbiri.
 * `ordered` kilidin açıldığı sıradır (sort_order): yol aşamaya göre çizildiği için çizim sırası
 * sıradaki adımları göstermez.
 */
export function farNodeIds(
  ordered: readonly { id: string; status: string }[],
  currentId: string | null,
  lookahead: number = PATH_LOOKAHEAD,
): Set<string> {
  const index = currentId ? ordered.findIndex((node) => node.id === currentId) : -1;
  if (index < 0) return new Set();
  return new Set(
    ordered
      .slice(index + lookahead + 1)
      .filter((node) => node.status !== "done")
      .map((node) => node.id),
  );
}
