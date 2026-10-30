import { foldTr } from "@/lib/documents/page-analysis";

/**
 * Belge metnindeki sınav ağırlığını konulara eşler (30 Ekim 2026, Paket I #4). Canlıda tahta fotoğrafında
 * "Yevmiye %35" yazıyordu; ağırlık yalnız konunun kaynak kaydından okunduğu için deneme Yevmiye'ye %15 verdi.
 *
 * Kural ders-bağımsız ve temkinli: yüzde ancak satırın kendisinde ya da üstündeki üç satırda bir sınav/ağırlık
 * ipucu ("ağırlık", "dağılım", "soru", "puan", "sınav", "vize", "final", "çıkar") varsa ağırlık sayılır.
 * "KDV oranı %20" bir vergi oranıdır, ağırlık değildir; ipucu olmadığı için eşlenmez. Konu adı satırda geçmeli
 * (adın 4+ harfli kelimelerinin ilk 5 harfi). Bir satırda birden çok yüzde varsa konu adına en yakın olan alınır.
 * Kayıttaki ağırlık her zaman önce gelir; bu yalnız boşluğu doldurur.
 */

const CUE = /ağırlı|agirli|dağılım|dagilim|\bsoru|\bpuan|sınav|sinav|\bvize|\bfinal|\bçıkar|\bcikar/iu;
const PERCENT = /(?:%\s?(\d{1,2})(?![\d.,])|(?<![\d.,])(\d{1,2})\s?%|yüzde\s+(\d{1,2})(?!\d))/giu;

function stems(label: string): string[] {
  return foldTr(label)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .map((word) => word.slice(0, 5));
}

/** Konu adının satırda geçen kökleri ve ilk yeri. */
function labelHit(foldedLine: string, label: string): { found: number; total: number; at: number } {
  const keys = stems(label);
  const spots = keys.map((key) => foldedLine.indexOf(key)).filter((at) => at >= 0);
  return { found: spots.length, total: keys.length, at: spots.length ? Math.min(...spots) : -1 };
}

export function topicWeightsFromText(text: string, labels: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!text.trim() || !labels.length) return out;
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const percents = [...line.matchAll(PERCENT)].map((match) => ({
      value: Number(match[1] ?? match[2] ?? match[3]),
      at: match.index ?? 0,
    }));
    if (!percents.length) continue;
    const window = lines.slice(Math.max(0, index - 3), index + 1).join(" ");
    if (!CUE.test(window)) continue;
    const folded = foldTr(line);
    const hits = labels
      .filter((label) => !out.has(label))
      .map((label) => ({ label, ...labelHit(folded, label) }))
      .filter((hit) => hit.total > 0 && hit.found > 0);
    // Adı tümüyle geçen konular önce ("Yevmiye defteri %35, Mizan %15": ikisi de); yoksa açık ara en çok kökü geçen
    // tek konu ("Graf soruları %40" → "Graf algoritmaları"). Eşitlikte belirsiz: hiçbiri ("defter" iki konuda).
    const full = hits.filter((hit) => hit.found === hit.total);
    let chosen = full;
    if (!full.length) {
      const best = Math.max(0, ...hits.map((hit) => hit.found));
      const top = hits.filter((hit) => hit.found === best);
      chosen = top.length === 1 && top[0]!.found / top[0]!.total >= 0.5 ? top : [];
    }
    for (const hit of chosen) {
      const nearest = [...percents].sort((x, y) => Math.abs(x.at - hit.at) - Math.abs(y.at - hit.at))[0]!;
      if (nearest.value > 0 && nearest.value <= 100) out.set(hit.label, nearest.value);
    }
  }
  // Toplam %100'ü belirgin aşıyorsa yüzdeler ağırlık değil (oran, faiz, istatistik): hiçbirini kullanma.
  const sum = [...out.values()].reduce((total, value) => total + value, 0);
  return sum > 120 ? new Map() : out;
}
