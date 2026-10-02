/**
 * Dersin çekirdek sayfaları (2 Ekim 2026). Ders tek kavram birimini anlatır:
 * belgenin ardışık birkaç sayfası. Dağınık sayfa listesinden en uzun ardışık
 * diziyi seçer (bir sayfalık boşluğa izin verir), en fazla `max` sayfa.
 * KPSS dersi s.5, 6, 11, 13, 28'den beş ilgisiz alt konu topluyordu.
 */
export function corePageRun(pages: number[], max = 6): number[] {
  const sorted = [...new Set(pages.filter((page) => Number.isInteger(page) && page > 0))].sort((a, b) => a - b);
  if (!sorted.length) return [];
  let best: number[] = [sorted[0]];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] <= 2) current.push(sorted[i]);
    else current = [sorted[i]];
    if (current.length > best.length) best = [...current];
  }
  // Bir sayfalık boşluk içeriği bölmesin: aradaki sayfayı da al.
  const filled: number[] = [];
  for (let page = best[0]; page <= best[best.length - 1]; page += 1) filled.push(page);
  return filled.slice(0, max);
}
