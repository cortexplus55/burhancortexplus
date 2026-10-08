/**
 * Ana konular belgede sırayla, çakışmadan dizilir (3 Ekim 2026).
 *
 * Alt başlıkların sayfaları çakışabiliyor; gruplama da bunu ana konuya
 * taşıyordu. 99 sayfalık trigonometride "Sinüs ve Kosinüs" 19–27'nin yanında
 * 37–48 ve 82–96'yı da aldı, "Dönüşüm Formülleri" iki ayrı ana konu olarak
 * aynı 64–72'yi taşıdı; KPSS'de 20 sayfa iki konuya birden bağlıydı. Sonuç:
 * aynı sayfalar iki derste anlatılıyor, öğrenci aynı dersi iki kez görüyor.
 *
 * Kural: her sayfa tek ana konuya gider ve her ana konu belgedeki sırasıyla
 * ardışık bir blok olur (gruplama istemi de "ardışık alt başlıklar" diyor).
 * Hangi sayfanın hangi konuya gideceğini, konuların sayfa iddialarıyla en çok
 * örtüşen sıralı bölme seçer. Bütün sayfaları başka konularca kapsanan konu
 * (kopya ya da iç içe) en çok sayfasını alan konuya katılır. Metne dokunmaz.
 */

type Ranged = { title: string; pageNumbers: number[] };

/** Konunun yeri: yalnız ona ait en uzun ardışık sayfa dizisinin başı. */
function anchorPage(own: number[], claimedByOthers: Set<number>): number {
  const runs = (pages: number[]) => {
    const out: number[][] = [];
    for (const page of pages) {
      const last = out[out.length - 1];
      if (last && page === last[last.length - 1] + 1) last.push(page);
      else out.push([page]);
    }
    return out;
  };
  const longest = (list: number[][]) =>
    list.reduce((best, run) => (run.length > best.length ? run : best), list[0] ?? []);
  const exclusive = own.filter((page) => !claimedByOthers.has(page));
  const run = exclusive.length ? longest(runs(exclusive)) : longest(runs(own));
  return run[0] ?? own[0] ?? 0;
}

export function exclusivePageRanges<T extends Ranged>(
  topics: T[],
): { topics: T[]; merged: { kept: string; dropped: string[] }[] } {
  const withPages = topics
    .map((topic, index) => ({
      topic,
      index,
      pages: [...new Set(topic.pageNumbers)].sort((a, b) => a - b),
    }))
    .filter((row) => row.pages.length);
  if (withPages.length < 2) return { topics: withPages.map((row) => row.topic), merged: [] };

  const claimants = new Map<number, number>();
  for (const row of withPages) for (const page of row.pages) claimants.set(page, (claimants.get(page) ?? 0) + 1);
  const ordered = withPages
    .map((row) => {
      const others = new Set(row.pages.filter((page) => (claimants.get(page) ?? 0) > 1));
      return { ...row, anchor: anchorPage(row.pages, others), claims: new Set(row.pages) };
    })
    .sort((a, b) => a.anchor - b.anchor || a.index - b.index);

  const pages = [...claimants.keys()].sort((a, b) => a - b);
  const K = ordered.length;
  const N = pages.length;
  // Sayfa bir konunun iddiasındaysa 1; iddiasında değil ama o konunun
  // başlangıcından önce duruyorsa (bölüm giriş sayfası) küçük bir pay.
  const gain = (i: number, k: number) =>
    ordered[k].claims.has(pages[i]) ? 1 : pages[i] < ordered[k].anchor ? 0.001 : 0;

  const best: number[][] = Array.from({ length: N }, () => new Array<number>(K).fill(-Infinity));
  const from: number[][] = Array.from({ length: N }, () => new Array<number>(K).fill(-1));
  for (let k = 0; k < K; k += 1) best[0][k] = gain(0, k);
  for (let i = 1; i < N; i += 1) {
    let prefixBest = -Infinity;
    let prefixAt = -1;
    for (let k = 0; k < K; k += 1) {
      // Aynı konuda kalmak eşitlikte önce gelir: bölme gereksiz yere kaymaz.
      let value = best[i - 1][k];
      let source = k;
      if (prefixBest > value) {
        value = prefixBest;
        source = prefixAt;
      }
      best[i][k] = value + gain(i, k);
      from[i][k] = source;
      if (best[i - 1][k] > prefixBest) {
        prefixBest = best[i - 1][k];
        prefixAt = k;
      }
    }
  }

  let k = 0;
  for (let j = 1; j < K; j += 1) if (best[N - 1][j] > best[N - 1][k]) k = j;
  const owner = new Array<number>(N);
  for (let i = N - 1; i >= 0; i -= 1) {
    owner[i] = k;
    if (i > 0) k = from[i][k];
  }

  const assigned = ordered.map(() => [] as number[]);
  owner.forEach((topic, i) => assigned[topic].push(pages[i]));

  const merged = new Map<number, string[]>();
  ordered.forEach((row, index) => {
    if (assigned[index].length) return;
    // Sayfalarının çoğunu alan konuya katılır.
    const counts = new Map<number, number>();
    for (const page of row.pages) {
      const host = owner[pages.indexOf(page)];
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    const host = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (host === undefined) return;
    merged.set(host, [...(merged.get(host) ?? []), row.topic.title]);
  });

  return {
    topics: ordered
      .map((row, index) => ({ ...row.topic, pageNumbers: assigned[index] }))
      .filter((topic) => topic.pageNumbers.length),
    merged: [...merged].map(([host, dropped]) => ({ kept: ordered[host].topic.title, dropped })),
  };
}
