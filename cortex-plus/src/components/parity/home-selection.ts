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

/** Ana ekranda seçili hazırlığın seçili konusunun adı (Faz 11: "mini test" çipinin konusu). Seçim yokken null. */
export function useSelectedCockpitTopic(): string | null {
  const value = useContext(HomeSelectionContext);
  if (!value) return null;
  return value.preps[value.prepIndex]?.topics[value.topicIndex]?.label ?? null;
}

/**
 * Hazırlığı kimliğiyle seçer (Faz 11: karşılama kartı bir hazırlığa bağlıysa ana ekranın seçimi o hazırlığa gelir).
 * Ana ekran dışında ya da hazırlık listede yoksa false.
 */
export function useSelectCockpitPrep(): (prepId: string) => boolean {
  const value = useContext(HomeSelectionContext);
  return (prepId: string) => {
    if (!value) return false;
    const index = value.preps.findIndex((prep) => prep.id === prepId);
    if (index < 0) return false;
    if (index !== value.prepIndex) value.selectPrep(index);
    return true;
  };
}
