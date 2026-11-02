/**
 * Belge eklenince çıkan konu hazır bir üniteyle eşleşiyor mu (2 Kasım 2026, ürün sahibinin kararı: "AI onu hangi
 * konulara eklediyse o konuya ekleme yapacak"). Eşleşen konu ayrı ücretli düğüm olmaz; o ünitenin
 * "Senin belgenden ek" kısmına bağlanır. Eşleşmeyen konu ayrı düğüm kalır ve "Belgendeki ek konu" diye gösterilir.
 * Eşleme model çağırmaz: ünite adı ve resmî kazanım metinleriyle sözcük örtüşmesi (temkinli eşik).
 */
export type UnitCandidate = { topicId: string; unitTitle: string; outcomeTexts: string[] };

export const EXTRA_TOPIC_PREFIX = "Belgendeki ek konu: ";

const STOP = new Set(["ve", "ile", "için", "olan", "veya", "bir", "bu", "şu", "gibi", "kadar", "konu", "konusu", "ünite", "bölüm", "giriş", "temel", "genel", "kavram", "kavramlar", "özellik", "özellikleri", "örnek", "örnekler", "soru", "sorular"]);

export function stems(text: string): string[] {
  const words = text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words.map((w) => w.slice(0, 5)))];
}

function coverage(source: string[], target: Set<string>): number {
  if (!source.length) return 0;
  return source.filter((s) => target.has(s)).length / source.length;
}

/** Konu başlığına en uygun hazır ünite; yeterince eşleşmiyorsa null. */
export function matchUnit(title: string, units: UnitCandidate[]): UnitCandidate | null {
  const words = stems(title);
  if (!words.length) return null;
  let best: { unit: UnitCandidate; score: number } | null = null;
  for (const unit of units) {
    const byTitle = coverage(words, new Set(stems(unit.unitTitle)));
    const byOutcomes = coverage(words, new Set(stems(unit.outcomeTexts.join(" "))));
    const hits = Math.round(byOutcomes * words.length);
    const score = byTitle >= 0.5 ? 1 + byTitle : byOutcomes >= 0.6 && hits >= Math.min(2, words.length) ? byOutcomes : 0;
    if (score > 0 && (!best || score > best.score)) best = { unit, score };
  }
  return best?.unit ?? null;
}
