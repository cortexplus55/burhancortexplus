"use client";

import { MasteryMap } from "@/components/level-check/mastery-map";
import type { MapUnitInput } from "@/lib/mastery-map/plan";
import { fakeLevelApi } from "../level-fake";

const o = (unit: number, i: number, alpha: number, beta: number, n: number) => ({
  outcomeId: `e2e#${unit * 10 + i}`,
  code: `E2E.${unit}.${i}`,
  text: `Fikstür kazanımı ${unit}.${i}: dar ekranda taşma sınaması için yazılmış uzun açıklama cümlesi.`,
  state: { alpha, beta, n },
});

/** 4 ünite: biri zayıf (veri), biri Biliyorum (öz işaret, veri yok), biri orta, biri veri yok. Kapasite 2 gün × 90 dk. */
const UNITS: MapUnitInput[] = [
  { unitId: "e2e-prog#1", title: "9. Sınıf · Fikstür Ünitesi A", order: 0, selfRating: null, outcomes: [o(1, 1, 3, 1, 2), o(1, 2, 2, 1, 1)] },
  { unitId: "e2e-prog#2", title: "9. Sınıf · Fikstür Ünitesi B", order: 1, selfRating: null, outcomes: [o(2, 1, 1, 3, 2), o(2, 2, 1, 2.3, 2)] },
  { unitId: "e2e-prog#3", title: "10. Sınıf · Fikstür Ünitesi C", order: 2, selfRating: "iyi", outcomes: [o(3, 1, 1, 1, 0)] },
  { unitId: "e2e-prog#4", title: "10. Sınıf · Fikstür Ünitesi D", order: 3, selfRating: null, outcomes: [o(4, 1, 1, 1, 0), o(4, 2, 1, 1, 0), o(4, 3, 1, 1, 0)] },
];

export function HakimiyetFixture() {
  return (
    <main style={{ padding: "1rem" }}>
      <MasteryMap prepId="e2e-prep" units={UNITS} daysLeft={2} dailyMinutes={90} api={fakeLevelApi({ guest: false })} />
    </main>
  );
}
