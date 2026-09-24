import { foldTr } from "@/lib/documents/page-analysis";

/** Bir hazırlığa bağlanan belge sayısı. Depolama ve sayfa kotası ayrıca durur. */
export const PREP_SOURCE_DOCUMENT_CAP = 8;

/**
 * Konu tavanı istek boyutunu sınırlar.
 * Öncelik (çekirdek / destek / gözden geçir) konu silmez; tavan aşılırsa
 * kalanlar da gönderilir, şema reddeder. İki ders notu bu tavana sığar.
 */
export const PREP_TOPIC_CAP = 80;

export type TopicDraft = {
  id: string;
  title: string;
  pages: number[];
};

/**
 * Aynı başlık iki belgede de varsa ikisi de kalır; ikincisinin adı ayrılır.
 * Çocuk düğümler burada elenmez — çağıran ana konuları verir.
 */
export function mergeTopicDrafts(groups: TopicDraft[][]): {
  topics: string[];
  topicPages: number[][];
} {
  const topics: string[] = [];
  const topicPages: number[][] = [];
  const used = new Set<string>();
  const seenIds = new Set<string>();

  for (const group of groups) {
    for (const topic of group) {
      if (seenIds.has(topic.id)) continue;
      seenIds.add(topic.id);
      topics.push(disambiguateTitle(topic.title, used, topics.length + 1));
      topicPages.push([...topic.pages]);
    }
  }

  return { topics, topicPages };
}

/** Aynı katlanmış başlık varsa sonuna sıra numarası ekler. */
export function disambiguateTitle(
  raw: string,
  used: Set<string>,
  nextIndex: number,
): string {
  const folded = foldTr(raw);
  const title = used.has(folded) ? `${raw} (${nextIndex})` : raw;
  used.add(foldTr(title));
  return title;
}
