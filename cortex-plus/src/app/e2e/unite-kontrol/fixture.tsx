"use client";

import { UnitLevelCheck } from "@/components/level-check/unit-level-check";
import { fakeLevelApi } from "../level-fake";

export function UniteKontrolFixture() {
  return (
    <main style={{ padding: "1rem" }}>
      <UnitLevelCheck prepId="e2e-prep" unitId="yks-2026-tarih#1" unitTitle="9. Sınıf · Tarih ve Zaman" api={fakeLevelApi({ guest: false })} />
    </main>
  );
}
