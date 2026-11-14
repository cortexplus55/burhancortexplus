"use client";

import { createContext, useContext } from "react";
import type { CockpitPrep } from "@/lib/learning/home-cockpit-model";

/**
 * Ana ekranın seçimi (şerit, halka, araç tepsisi aynı seçimi okur). Küçük ayrı modül: sohbet paneli seçili hazırlığı
 * okurken ana ekranın bileşenlerini ve stilini öbür sayfalara taşımasın.
 */
export type HomeSelection = {
  preps: CockpitPrep[];
  prepIndex: number;
  topicIndex: number;
  selectPrep: (index: number) => void;
  selectTopic: (index: number) => void;
};

export const HomeSelectionContext = createContext<HomeSelection | null>(null);

/**
 * Ana ekranda seçili hazırlığın kimliği (15 Kasım 2026): "Sor" çubuğundan giden mesaj o hazırlığın bağlamında başlar.
 * Ana ekran dışında (seçim yokken) null.
 */
export function useSelectedCockpitPrepId(): string | null {
  const value = useContext(HomeSelectionContext);
  return value ? (value.preps[value.prepIndex]?.id ?? null) : null;
}
