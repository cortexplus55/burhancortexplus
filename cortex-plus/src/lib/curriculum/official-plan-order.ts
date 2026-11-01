import type { UnitRating } from "@/lib/curriculum/official-setup-select";

/**
 * Resmî kurulumda öz değerlendirmenin yola etkisi (1 Kasım 2026, PR #466 canlı testi).
 *
 * Kural (genel, sınav adına bakmaz):
 * 1. Ön koşul sırası ders içinde bozulmaz. "Ders" = aynı bölüm (TYT/AYT) ve aynı resmî program.
 * 2. "Zayıf" ünitesi olan her dersin, o üniteye kadarki üniteleri (ön koşullarıyla) yolun başına alınır;
 *    birden çok ders varsa bu zincirler sırayla dönüşümlü dizilir, böylece her Zayıf ünite erkenden gelir.
 *    Zincirdeki "Biliyorum" üniteleri zinciri uzatmaz (öğrenci biliyor; ön koşul sağlanmış sayılır).
 * 3. Kalan üniteler kurulumdaki sırasıyla gelir.
 * 4. "Biliyorum" üniteleri en sona alınır ve takvimde daha kısa süre alır (`selfKnown`).
 * Puan verilmemişse sıra hiç değişmez.
 */
export type OrderableUnit = { topic: string; programId: string; part: string | null; rating?: UnitRating | null };

export function orderOfficialUnits<U extends OrderableUnit>(units: readonly U[]): U[] {
  if (!units.some((u) => u.rating === "zayif" || u.rating === "iyi")) return units.slice();
  const groups = new Map<string, U[]>();
  for (const unit of units) {
    const key = `${unit.part ?? ""}|${unit.programId}`;
    const list = groups.get(key) ?? [];
    list.push(unit);
    groups.set(key, list);
  }
  const chains: U[][] = [];
  for (const list of groups.values()) {
    let last = -1;
    list.forEach((u, i) => {
      if (u.rating === "zayif") last = i;
    });
    if (last >= 0) chains.push(list.slice(0, last + 1).filter((u) => u.rating !== "iyi"));
  }
  const front: U[] = [];
  for (let step = 0; chains.some((c) => step < c.length); step += 1) {
    for (const chain of chains) if (step < chain.length) front.push(chain[step]!);
  }
  const placed = new Set(front);
  const middle = units.filter((u) => !placed.has(u) && u.rating !== "iyi");
  const known = units.filter((u) => !placed.has(u) && u.rating === "iyi");
  return [...front, ...middle, ...known];
}
