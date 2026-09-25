import { mergeTopicGroups, type TopicSourceRef } from "@/lib/learning/topic-merge";

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
  documentId?: string;
  fileName?: string;
  prerequisites?: string[];
};

/**
 * Aynı başlık birden fazla dosyadaysa TEK konu olur ve bütün kaynaklar onda kalır.
 * Yazımı tutmayan başlık düşmez. Çocuk düğümler burada elenmez — çağıran ana
 * konuları verir. Gri bölge (modele sorulacak çift) bu saf birleştirmede ayrı kalır.
 */
export function mergeTopicDrafts(groups: TopicDraft[][]): {
  topics: string[];
  topicPages: number[][];
  sources: TopicSourceRef[][];
  prerequisites: string[][];
} {
  const { topics: merged } = mergeTopicGroups(groups);
  return {
    topics: merged.map((topic) => topic.title),
    topicPages: merged.map((topic) => topic.pages),
    sources: merged.map((topic) => topic.sources),
    prerequisites: merged.map((topic) => topic.prerequisites),
  };
}

