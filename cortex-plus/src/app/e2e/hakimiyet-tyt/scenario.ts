import type { MapUnitInput } from "@/lib/mastery-map/plan";
import type { MasteryState } from "@/lib/level-check/mastery";

/**
 * Canlı doğrulamadaki senaryonun birebir kopyası (yalnız sayılar): TYT Temel Matematik, 11 ünite, sınava 10 gün,
 * günde 30 dk, Mantık "Zayıf", Kümeler "Biliyorum", tarama atlandı. Kontrol sonrası Mantık'ın 4 kazanımı
 * %33 / %37 / %70 / %33 (her biri 1 yanıt).
 */
export const TYT_DAYS = 10;
export const TYT_DAILY = 30;
const P: MasteryState = { alpha: 1, beta: 1, n: 0 };
export const MANTIK_AFTER: MasteryState[] = [
  { alpha: 1, beta: 2, n: 1 },
  { alpha: 1, beta: 1.7, n: 1 },
  { alpha: 2.3, beta: 1, n: 1 },
  { alpha: 1, beta: 2, n: 1 },
];
const UNITS: [string, number, MapUnitInput["selfRating"]][] = [
  ["Mantık", 5, "zayif"],
  ["Denklemler ve Eşitsizlikler", 12, null],
  ["Üçgenler", 16, null],
  ["Veri", 3, null],
  ["Sayma ve Olasılık", 8, null],
  ["Fonksiyonlar", 7, null],
  ["Polinomlar", 4, null],
  ["İkinci Dereceden Denklemler", 4, null],
  ["Dörtgenler ve Çokgenler", 3, null],
  ["Uzay Geometri", 1, null],
  ["Kümeler", 5, "iyi"],
];

export function tytScenario(answered: boolean): MapUnitInput[] {
  return UNITS.map(([title, count, selfRating], u) => ({
    unitId: `e2e-tyt#${u + 1}`,
    title,
    order: u,
    selfRating,
    outcomes: Array.from({ length: count }, (_, i) => ({
      outcomeId: `e2e-tyt#${u + 1}.${i + 1}`,
      code: `T.${u + 1}.${i + 1}`,
      text: `${title} kazanımı ${i + 1}`,
      state: answered && u === 0 ? (MANTIK_AFTER[i] ?? P) : P,
    })),
  }));
}
