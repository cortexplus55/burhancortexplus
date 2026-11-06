import { foldTr } from "@/lib/documents/page-analysis";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";

/**
 * Öğrencinin son konu listesi yolu kurar.
 *
 * Belgeden gelen konu, öğrenci silmediyse durur. Yeniden adlandırma
 * mümkünse aynı düğüme bağlı kalır. Eklenen başlık ancak belgede
 * doğrulandıysa girer. Öncelik silmez; silme öğrencinin işidir.
 */

export type LoadedPrepTopic = {
  id: string;
  title: string;
  objective?: string | null;
  prerequisites?: string[];
  pageNumbers?: number[];
  measuredLevel?: "unknown" | "weak" | "emerging" | "solid" | null;
  selfHard?: boolean;
  priority?: number | null;
  weightPercent?: number | null;
  examHeavy?: boolean;
  importance?: "important" | "medium" | "less" | null;
  sourceRefs?: TopicSourceRef[];
  /** Kavram birimleri; yeniden adlandırmada da konuya bağlı kalır. */
  units?: { title: string; pages: number[] }[];
};

export type LoadedPrepTopics = {
  titles: string[];
  nodeIds: (string | null)[];
  scheduleTopics: LoadedPrepTopic[];
};

export type RequestedPrepTopic = {
  title: string;
  linkedTitle: string | null;
  pageNumbers: number[];
  sourceRefs?: TopicSourceRef[];
};

function foldOf(title: string): string {
  return foldTr(title).replace(/\s+/g, " ").trim();
}

function findLoadedIndex(
  item: RequestedPrepTopic,
  loaded: LoadedPrepTopics,
  used: Set<number>,
): number | null {
  const want = foldOf(item.title);
  const link = item.linkedTitle ? foldOf(item.linkedTitle) : "";

  for (let index = 0; index < loaded.scheduleTopics.length; index += 1) {
    if (used.has(index)) continue;
    const have = foldOf(loaded.scheduleTopics[index]?.title ?? loaded.titles[index] ?? "");
    if (have && have === want) return index;
  }

  if (link) {
    for (let index = 0; index < loaded.scheduleTopics.length; index += 1) {
      if (used.has(index)) continue;
      const have = foldOf(loaded.scheduleTopics[index]?.title ?? loaded.titles[index] ?? "");
      if (have && have === link) return index;
    }
  }

  let best: number | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < loaded.scheduleTopics.length; index += 1) {
    if (used.has(index)) continue;
    const have = foldOf(loaded.scheduleTopics[index]?.title ?? "");
    if (have.length < 4 || want.length < 4) continue;
    if (!want.includes(have) && !have.includes(want)) continue;
    const gap = Math.abs(have.length - want.length);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Öğrencinin elle eklediği (haritada olmayan) konunun geçici takvim kimliği. Konunun kayıt kimliği hazırlık yazılınca
 * oluşur; kurulum bu kimliği kayıttan sonra gerçek konu satırının kimliğine çevirir (`addedTopicIdMap`). 6 Kasım 2026'ya
 * kadar çevrilmiyordu: yol adımı "added:5:…" taşıyordu, düğüm konusunu bulamayıp ilk konunun sayfalarından yazılıyordu.
 */
export const ADDED_TOPIC_ID_PREFIX = "added:";

/** Kayıttan sonra: geçici "added:" kimliği → aynı sıradaki (`sort_order`) konu satırının kimliği. */
export function addedTopicIdMap(
  scheduleTopics: readonly { id?: string | null }[],
  saved: readonly { id: string; sort_order: number }[],
): Map<string, string> {
  const bySort = new Map(saved.map((row) => [row.sort_order, row.id]));
  const out = new Map<string, string>();
  scheduleTopics.forEach((topic, index) => {
    const id = topic.id ?? "";
    const real = bySort.get(index);
    if (id.startsWith(ADDED_TOPIC_ID_PREFIX) && real) out.set(id, real);
  });
  return out;
}

export function applyStudentTopicList(input: {
  requested: RequestedPrepTopic[];
  loaded: LoadedPrepTopics;
  hardTopics?: string[];
}): LoadedPrepTopics {
  const hard = new Set(
    (input.hardTopics ?? []).map((topic) => topic.trim().toLocaleLowerCase("tr")),
  );
  const used = new Set<number>();
  const titles: string[] = [];
  const nodeIds: (string | null)[] = [];
  const scheduleTopics: LoadedPrepTopic[] = [];

  for (const item of input.requested) {
    const title = item.title.trim();
    if (!title) continue;
    const index = findLoadedIndex(item, input.loaded, used);
    const selfHard = hard.has(title.toLocaleLowerCase("tr"));
    if (index != null) {
      used.add(index);
      const source = input.loaded.scheduleTopics[index];
      titles.push(title);
      nodeIds.push(input.loaded.nodeIds[index] ?? source?.id ?? null);
      scheduleTopics.push({
        ...source,
        id: source?.id ?? `topic-${titles.length}`,
        title,
        selfHard: Boolean(source?.selfHard) || selfHard,
        pageNumbers: source?.pageNumbers?.length ? source.pageNumbers : item.pageNumbers,
        sourceRefs: source?.sourceRefs?.length ? source.sourceRefs : item.sourceRefs ?? [],
      });
      continue;
    }
    titles.push(title);
    nodeIds.push(null);
    scheduleTopics.push({
      id: `${ADDED_TOPIC_ID_PREFIX}${titles.length}:${foldOf(title).slice(0, 24) || "konu"}`,
      title,
      pageNumbers: item.pageNumbers,
      sourceRefs: item.sourceRefs ?? [],
      measuredLevel: "unknown",
      selfHard,
      priority: 3,
    });
  }

  return { titles, nodeIds, scheduleTopics };
}
