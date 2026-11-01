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

/**
 * Zorluk karışımı (2. düzeltme, 1 Kasım 2026): 0.7 / 1.0 / 1.3 ağırlıkları ancak karışık zorlukla işe yarar.
 * - Hızlı Tarama: çoğu orta, biraz kolay ve zor. 12 soruda 8 orta + 2 kolay + 2 zor (sıra `SCAN_MIX`).
 * - Ünite Seviye Kontrolü: orta, kolay, zor (+ 4. soru orta) — her zorluktan en az bir soru.
 * İstenen zorluk ünitede kalmadıysa sırayla orta → kolay → zor alınır (havuzda olmayan soru uydurulmaz).
 */
export const SCAN_MIX: Difficulty[] = ["medium", "medium", "easy", "medium", "hard", "medium", "medium", "easy", "medium", "hard", "medium", "medium"];
export const UNIT_CHECK_MIX: Difficulty[] = ["medium", "easy", "hard", "medium"];
const FALLBACK: Difficulty[] = ["medium", "easy", "hard"];

/** Ünitenin zorluk kovaları; her kovada farklı kazanımlar önce. */
class UnitBuckets {
  private buckets = new Map<Difficulty, PickItem[]>();
  private usedOutcomes = new Set<string>();
  constructor(items: readonly PickItem[]) {
    for (const d of FALLBACK) this.buckets.set(d, items.filter((i) => i.difficulty === d));
  }
  get size(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.length;
    return n;
  }
  take(want: Difficulty): PickItem | null {
    for (const d of [want, ...FALLBACK.filter((x) => x !== want)]) {
      const bucket = this.buckets.get(d)!;
      if (!bucket.length) continue;
      let idx = bucket.findIndex((i) => !this.usedOutcomes.has(i.outcomeId));
      if (idx < 0) idx = 0;
      const [item] = bucket.splice(idx, 1);
      this.usedOutcomes.add(item!.outcomeId);
      return item!;
    }
    return null;
  }
}

/**
 * ⚡ Akıllı Hızlı Tarama: ağırlığı en yüksek üniteler önce; tur tur her üniteden bir soru (en çok 12), zorluk
 * `SCAN_MIX` sırasıyla. Sorusu olmayan ünite atlanır. Havuz 10'dan az soru veriyorsa olan kadar döner.
 */
export function pickQuickScan(units: readonly ScanUnit[], items: readonly PickItem[], max = QUICK_SCAN_MAX): PickItem[] {
  const byUnit = new Map<string, PickItem[]>();
  for (const item of items) byUnit.set(item.unitId, [...(byUnit.get(item.unitId) ?? []), item]);
  const ranked = units
    .filter((u) => byUnit.has(u.unitId))
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map((u) => new UnitBuckets(byUnit.get(u.unitId)!));
  const picked: PickItem[] = [];
  while (picked.length < max && ranked.some((q) => q.size > 0)) {
    for (const queue of ranked) {
      if (picked.length >= max) break;
      const item = queue.take(SCAN_MIX[picked.length % SCAN_MIX.length]!);
      if (item) picked.push(item);
    }
  }
  return picked;
}

/** Ünite Seviye Kontrolü: üniteden 3–4 soru, `UNIT_CHECK_MIX` zorluklarıyla, önce farklı kazanımlar. 3'ten azsa boş. */
export function pickUnitCheck(items: readonly PickItem[]): PickItem[] {
  if (items.length < UNIT_CHECK_MIN) return [];
  const buckets = new UnitBuckets(items);
  const out: PickItem[] = [];
  for (const want of UNIT_CHECK_MIX) {
    const item = buckets.take(want);
    if (item) out.push(item);
  }
  return out;
}

/** Kurulum ağacı kimliği (`program#index`, 0 tabanlı) → havuz kimliği (curriculum_units.id, 1 tabanlı). */
export function poolIdFromSetupId(setupUnitId: string): string | null {
  const m = /^([a-z0-9-]{3,60})#(\d{1,3})$/.exec(setupUnitId);
  return m ? `${m[1]}#${Number(m[2]) + 1}` : null;
}
