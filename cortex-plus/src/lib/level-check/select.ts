/**
 * Seviye kontrolü soru seçimi (Plan PR 3). Saf; yalnız havuzdaki doğrulanmış sorulardan seçer, hiç üretmez.
 *
 * Ünite ağırlığı: ÖSYM/MEB ünite başına soru payı yayımlamıyor (kayıt defterinde ünite düzeyinde resmî soru
 * dağılımı yok). Bu yüzden dürüst bir vekil kullanılır: ünitenin resmî kazanım sayısı. Kazanımı çok olan
 * ünite programda daha çok yer tutar; "soru payı" iddiası değildir. Resmî ünite ağırlığı kayda eklenirse
 * `weight` onu taşır ve seçim değişmeden çalışır.
 */
import type { Difficulty } from "@/lib/level-check/mastery";

export type PickItem = { id: string; unitId: string; outcomeId: string; difficulty: Difficulty };
export type ScanUnit = { unitId: string; weight: number; order: number };

export const QUICK_SCAN_MAX = 12;
export const QUICK_SCAN_MIN = 10;
export const GUEST_PREVIEW_COUNT = 3;
export const UNIT_CHECK_MIN = 3;
export const UNIT_CHECK_MAX = 4;

const DIFFICULTY_PREF: Difficulty[] = ["medium", "easy", "hard"];

/** Bir ünitenin sırayla alınacak soruları: önce her kazanımdan bir orta soru, sonra kolay, sonra zor. */
function unitQueue(items: readonly PickItem[]): PickItem[] {
  const out: PickItem[] = [];
  for (const diff of DIFFICULTY_PREF) {
    const seen = new Set<string>();
    for (const item of items) {
      if (item.difficulty !== diff || seen.has(item.outcomeId)) continue;
      seen.add(item.outcomeId);
      out.push(item);
    }
  }
  for (const item of items) if (!out.includes(item)) out.push(item);
  return out;
}

/**
 * ⚡ Akıllı Hızlı Tarama: ağırlığı en yüksek üniteler önce; tur tur her üniteden bir soru (en çok 12).
 * Sorusu olmayan ünite atlanır. Havuz 10'dan az soru veriyorsa olan kadar döner (ekranda gerçek sayı yazar).
 */
export function pickQuickScan(units: readonly ScanUnit[], items: readonly PickItem[], max = QUICK_SCAN_MAX): PickItem[] {
  const byUnit = new Map<string, PickItem[]>();
  for (const item of items) byUnit.set(item.unitId, [...(byUnit.get(item.unitId) ?? []), item]);
  const ranked = units
    .filter((u) => byUnit.has(u.unitId))
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map((u) => unitQueue(byUnit.get(u.unitId)!));
  const picked: PickItem[] = [];
  for (let round = 0; picked.length < max && ranked.some((q) => round < q.length); round += 1) {
    for (const queue of ranked) {
      if (picked.length >= max) break;
      if (round < queue.length) picked.push(queue[round]!);
    }
  }
  return picked;
}

/** Ünite Seviye Kontrolü: üniteden 3–4 soru, önce farklı kazanımlar. 3'ten az soru varsa boş (önerilmez). */
export function pickUnitCheck(items: readonly PickItem[]): PickItem[] {
  const queue = unitQueue(items);
  if (queue.length < UNIT_CHECK_MIN) return [];
  return queue.slice(0, UNIT_CHECK_MAX);
}

/** Kurulum ağacı kimliği (`program#index`, 0 tabanlı) → havuz kimliği (curriculum_units.id, 1 tabanlı). */
export function poolIdFromSetupId(setupUnitId: string): string | null {
  const m = /^([a-z0-9-]{3,60})#(\d{1,3})$/.exec(setupUnitId);
  return m ? `${m[1]}#${Number(m[2]) + 1}` : null;
}
