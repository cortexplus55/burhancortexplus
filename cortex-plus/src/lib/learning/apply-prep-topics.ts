import { foldTr } from "@/lib/documents/page-analysis";
import type { GroundMatch } from "@/lib/learning/topic-grounding";
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
      id: `added:${titles.length}:${foldOf(title).slice(0, 24) || "konu"}`,
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

export function requestedFromGround(
  title: string,
  match: GroundMatch,
): RequestedPrepTopic {
  return {
    title: title.trim(),
    linkedTitle: match.linkedTitle,
    pageNumbers: match.pageNumbers,
    sourceRefs: match.sourceRefs,
  };
}
