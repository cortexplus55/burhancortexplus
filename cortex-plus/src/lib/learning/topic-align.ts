/**
 * İki konu başlığı aynı konuyu mu söylüyor? Kaynak çözücü ve sayfa
 * genişletme bunu soruyor. Eski ders kapısından (lesson-teach.ts) taşındı;
 * o dosya 3 Ekim 2026'da silindi.
 */

import { topicMatchKey } from "@/lib/learning/topic-merge";

/**
 * Başlık hizalaması — dil ve konu bağımsız.
 *
 * 1) Tam eşleşme (topicMatchKey)
 * 2) ≥10 karakterlik alt dize
 * 3) Katlanmış kök örtüşmesi: anlamlı kelime köklerinin çoğunluğu ortak
 *    (en az 2 ortak kök ve ortak / kısa taraf ≥ 0.6)
 */
export function topicTitlesAlign(left: string, right: string): boolean {
  const a = topicMatchKey(left);
  const b = topicMatchKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= 10 && long.includes(short)) return true;
  return topicStemOverlap(a, b);
}

/** Test ve eşik belgesi için kök örtüşmesi. */
function topicStemOverlap(leftKey: string, rightKey: string): boolean {
  const left = leftKey.split(" ").filter((token) => token.length >= 3);
  const right = rightKey.split(" ").filter((token) => token.length >= 3);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  let shared = 0;
  for (const token of left) {
    if (rightSet.has(token)) shared += 1;
  }
  if (shared < 2) return false;
  const shorter = Math.min(left.length, right.length);
  return shared / shorter >= 0.6;
}
