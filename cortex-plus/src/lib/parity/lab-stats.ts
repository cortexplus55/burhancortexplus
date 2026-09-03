/**
 * Katalog metriklerinin görünüm katmanı.
 *
 * Sayılar gerçek kullanımdan gelir, uydurulmaz. Başlangıçta düşük olacaklar —
 * Astra'nın "44k oynanma"sı gibi durmayacak. Bu kasıtlı: sahte sosyal kanıt
 * göstermektense az ama doğru sayı göstermek daha iyi. Bu yüzden sıfır oynanma
 * hiç gösterilmez, rozet basılmaz.
 */

export type LabStat = {
  app_id: string;
  plays: number;
  rating_avg: number | null;
  rating_count: number;
};

export type LabStatMap = Record<string, LabStat>;

export function toStatMap(rows: unknown): LabStatMap {
  if (!Array.isArray(rows)) return {};
  const map: LabStatMap = {};
  for (const row of rows as Record<string, unknown>[]) {
    const id = typeof row.app_id === "string" ? row.app_id : null;
    if (!id) continue;
    map[id] = {
      app_id: id,
      plays: Number(row.plays ?? 0),
      rating_avg: row.rating_avg === null || row.rating_avg === undefined
        ? null
        : Number(row.rating_avg),
      rating_count: Number(row.rating_count ?? 0),
    };
  }
  return map;
}

/** 1.240 → "1,2k" — Astra'nın kompakt sayı biçimi. */
export function formatPlays(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(".", ",").replace(",0", "")}k`;
  }
  return String(count);
}

/** Gerçekten oynanmış uygulamalar, çoktan aza. Hiç oynanmamışlar listede yok. */
export function topPlayed(
  apps: { id: string }[],
  stats: LabStatMap,
  limit = 10,
): { id: string; plays: number }[] {
  return apps
    .map((app) => ({ id: app.id, plays: stats[app.id]?.plays ?? 0 }))
    .filter((row) => row.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit);
}

/** Puan ancak birkaç oy toplandıktan sonra anlamlı; öncesinde gösterilmez. */
export const MIN_RATINGS_TO_SHOW = 3;

export function displayRating(stat: LabStat | undefined): string | null {
  if (!stat || stat.rating_avg === null) return null;
  if (stat.rating_count < MIN_RATINGS_TO_SHOW) return null;
  return stat.rating_avg.toFixed(1).replace(".", ",");
}
