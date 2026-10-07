/**
 * Temiz metin kabul kuralları (saf). Model temizlik yerine özet yazarsa,
 * bir sayıyı değiştirirse ya da sayfayı boşaltırsa temiz metin alınmaz;
 * sayfa ham metniyle kalır. Bilgi değişmemeli: temizlik yalnız yazım,
 * tanıma hatası ve sayfa kenarı satırı.
 */

function digits(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

/** Ham sayfadaki sayıların en az bu kadarı temiz metinde kalmalı. */
const MIN_NUMBER_KEEP = 0.9;

export function acceptCleanPage(raw: string, cleaned: string): boolean {
  const before = raw.replace(/\s+/g, " ").trim();
  const after = cleaned.replace(/\s+/g, " ").trim();
  if (!after) return false;
  // Özet ya da uydurma: uzunluk çok değişmemeli (atılan başlık ve tablo
  // biçimi payı bırakılarak).
  const ratio = after.length / Math.max(1, before.length);
  if (ratio < 0.6 || ratio > 1.35) return false;
  const rawNumbers = digits(before).filter((n) => n.length >= 2);
  if (rawNumbers.length >= 3) {
    const pool = new Map<string, number>();
    for (const n of digits(after)) pool.set(n, (pool.get(n) ?? 0) + 1);
    // Sayfanın ilk ve son iki satırı (üst/alt bilgi) atılabilir: oradaki
    // sayılar kayıp sayılmaz. Termodinamik s.14'te "Sayfa 14/30" ve alttaki
    // "14" yüzünden kusursuz temizlik reddediliyordu.
    // Kısa sayfada "kenar" sayfanın kendisidir; pay yalnız uzun sayfaya.
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const edgePool = new Map<string, number>();
    const edgeLines = lines.length >= 8 ? [...lines.slice(0, 2), ...lines.slice(-2)] : [];
    for (const n of digits(edgeLines.join(" "))) edgePool.set(n, (edgePool.get(n) ?? 0) + 1);
    let kept = 0;
    for (const n of rawNumbers) {
      const left = pool.get(n) ?? 0;
      const edge = edgePool.get(n) ?? 0;
      if (left > 0) {
        kept += 1;
        pool.set(n, left - 1);
      } else if (edge > 0) {
        kept += 1;
        edgePool.set(n, edge - 1);
      }
    }
    // Kenar dışında da küçük pay.
    if (kept / rawNumbers.length < MIN_NUMBER_KEEP && rawNumbers.length - kept > 2) return false;
  }
  return true;
}

function edgeKey(line: string): string {
  return line
    .toLocaleLowerCase("tr")
    .replace(/\d+/g, "#")
    .replace(/[^\p{L}#]+/gu, " ")
    .trim();
}

/**
 * Sayfaların başında ya da sonunda tekrar eden satırlar ("KPSS HUKUKUN
 * TEMEL KAVRAMLARI", "Sayfa 12"). Bunlar konu adı ya da ders cümlesi olamaz.
 * Eşik: sayfaların en az %30'u ve en az üç sayfa.
 */
export function repeatedEdgeLines(pages: string[]): string[] {
  const counts = new Map<string, { line: string; count: number }>();
  const nonEmpty = pages.filter((page) => page.trim());
  for (const page of nonEmpty) {
    const lines = page
      .split(/\r?\n/)
      .map((line) => line.replace(/[`*#>|]/g, " ").replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 3);
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((line) => line.slice(0, 120)));
    for (const line of edges) {
      const key = edgeKey(line);
      if (key.length < 3) continue;
      const hit = counts.get(key);
      if (hit) hit.count += 1;
      else counts.set(key, { line, count: 1 });
    }
  }
  const need = Math.max(3, Math.ceil(nonEmpty.length * 0.3));
  return [...counts.values()].filter((entry) => entry.count >= need).map((entry) => entry.line);
}

/** Konu adı sayfa kenarında tekrar eden bir satırsa konu değildir. */
export function isRunningHeader(title: string, edges: string[]): boolean {
  const key = edgeKey(title);
  return key.length >= 3 && edges.some((line) => edgeKey(line) === key);
}
