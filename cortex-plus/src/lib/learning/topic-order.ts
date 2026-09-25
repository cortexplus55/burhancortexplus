import { orderTopicsByPrerequisites, type ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";

/**
 * Temel konu, ona dayanan konudan önce gelir.
 *
 * Sıra öğretmen analizinde saklı önkoşul adlarından kurulur. Öğrenci
 * listedeki oklarla sırayı değiştirdiyse o sıra durur; otomatik sıra
 * öğrencinin eliyle kurduğu sıranın üstüne yazılmaz.
 */
export function orderTopicsForPath<T extends { title: string; prerequisites?: string[] }>(
  topics: T[],
  options: { manualOrder: boolean },
): T[] {
  if (options.manualOrder || topics.length < 2) return topics.slice();
  const inputs: ScheduleTopicInput[] = topics.map((topic, index) => ({
    id: String(index),
    title: topic.title,
    prerequisites: topic.prerequisites ?? [],
  }));
  return orderTopicsByPrerequisites(inputs).map((item) => topics[Number(item.id)]);
}
