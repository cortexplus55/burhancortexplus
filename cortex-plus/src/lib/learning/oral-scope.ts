/**
 * Sözlü "Tüm sınav" (V6): kaynak eskiden konu adlarının 400 karakterlik birleşiminden arama ile geliyordu
 * (en alakalı 4 parça); sorular baştaki iki üç konuya yığılıyordu. Şimdi konular K1..KN boyunca eşit
 * aralıkla seçilir, her seçilen konudan kendi sayfası gelir ve her soru bir konuya atanır.
 */

import { pickTopicsForCount } from "@/lib/learning/mock-exam/allocate";

/** Tüm sınav kaynağında toplam sayfa üst sınırı. */
export const ORAL_ALL_MAX_PAGES = 16;

/**
 * K1..KN içinden `count` konu, uçlar dahil eşit aralıkla. Konu sayısı yetmezse hepsi. Yazılı denemeyle aynı seçim
 * işlevi (30 Ekim 2026, Paket I #4): ağırlık verilirse ağırlıklı konular önce.
 */
export function balancedOralTopics<T>(
  topics: readonly T[],
  count: number,
  weightOf?: (topic: T) => { percent: number | null; heavy: boolean },
): T[] {
  return pickTopicsForCount(topics, count, weightOf);
}

/** Soru i → konu. Konu sayısı soru sayısından azsa sırayla döner. */
export function oralQuestionPlan(labels: readonly string[], count: number): string[] {
  const chosen = balancedOralTopics(labels, count);
  if (!chosen.length) return [];
  return Array.from({ length: Math.max(1, Math.floor(count)) }, (_, i) => chosen[i % chosen.length]!);
}

export type OralScopeTopic = { label: string; documentId: string | null; pages: number[] };

/** Seçilen her konudan ilk sayfaları; toplam `ORAL_ALL_MAX_PAGES`'i aşmaz, her konu en az bir sayfa. */
export function oralScopeSources(
  topics: readonly OralScopeTopic[],
  count: number,
): OralScopeTopic[] {
  const chosen = balancedOralTopics(
    topics.filter((topic) => topic.label.trim()),
    count,
  );
  const perTopic = Math.max(1, Math.floor(ORAL_ALL_MAX_PAGES / Math.max(1, chosen.length)));
  return chosen.map((topic) => ({
    ...topic,
    pages: [...new Set(topic.pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b).slice(0, perTopic),
  }));
}

export function oralPlanBrief(plan: readonly string[]): string {
  if (!plan.length) return "";
  return [
    "SORU DAĞILIMI (tüm sınav): her soru yalnız yanında yazan konudan, bu sırayla. Aynı konuya ikinci soru yazma; konu listede iki kez geçiyorsa farklı bir noktasını sor.",
    ...plan.map((label, index) => `${index + 1}. ${label}`),
  ].join("\n");
}
