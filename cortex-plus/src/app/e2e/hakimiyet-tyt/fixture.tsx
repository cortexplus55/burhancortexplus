"use client";

import { MasteryMap } from "@/components/level-check/mastery-map";
import { UnitLevelCheck } from "@/components/level-check/unit-level-check";
import type { LevelApi } from "@/lib/level-check/types";
import type { MapUnitInput } from "@/lib/mastery-map/plan";
import { fakeLevelApi } from "../level-fake";
import { TYT_DAILY, TYT_DAYS } from "./scenario";

/** Yanıtlar "kaydedilince" sunucu tarafı veri değişir (çerez): router.refresh() ile haritanın güncellendiği sınanır. */
function savingApi(): LevelApi {
  const base = fakeLevelApi({ guest: false });
  return {
    start: base.start,
    async answer(req) {
      document.cookie = "e2e_tyt=answered; path=/";
      return base.answer(req);
    },
  };
}

export function TytFixture({ units }: { units: MapUnitInput[] }) {
  const api = savingApi();
  return (
    <main style={{ padding: "1rem" }}>
      <UnitLevelCheck prepId="e2e-tyt" unitId="e2e-tyt#1" unitTitle="Mantık" api={api} />
      <MasteryMap prepId="e2e-tyt" units={units} daysLeft={TYT_DAYS} dailyMinutes={TYT_DAILY} api={api} />
    </main>
  );
}
