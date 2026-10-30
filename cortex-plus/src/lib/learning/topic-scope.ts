import { matchExclusion, type ExcludedTopicNote } from "@/lib/learning/cross-material-topics";

/**
 * Belgenin "finalde yok / kapsam dışı" dediği konular hazırlık listesine girmez (Paket I, 30 Ekim 2026).
 *
 * Karar: konu belgenin haritasında KALIR, hazırlığın konu listesinden çıkar ve kurulumda "kapsam dışı"
 * notuyla gösterilir. Belge haritası belgeye aittir ve başka bir hazırlıkta (bütünleme, başka sınav) aynı
 * konu kapsam içi olabilir; sınav kapsamı ise hazırlığın bilgisidir. Eski birleştirme yolu da böyle
 * yapıyordu (`consolidateMaterials` → `excluded`); kurs haritası yolunda hiç okunmuyordu. Öğrenci konuyu
 * listeye geri yazabilir; kurulum öğrencinin son listesiyle kurulur.
 *
 * Bütün konuları düşürecek ifade yok sayılır (yanlış okunmuş bir cümle hazırlığı boşaltmasın).
 */
export function splitExcludedTopics<T extends { title: string }>(
  topics: readonly T[],
  units: readonly { title: string; topicIndexes: number[] }[],
  phrases: readonly string[],
): { topics: T[]; units: { title: string; topicIndexes: number[] }[]; excluded: ExcludedTopicNote[] } {
  const hits = topics.map((topic) => phrases.find((phrase) => matchExclusion(phrase, topic.title) === "drop") ?? null);
  if (!hits.some(Boolean) || hits.every(Boolean)) {
    return { topics: [...topics], units: units.map((unit) => ({ ...unit })), excluded: [] };
  }
  const newIndex = new Map<number, number>();
  const kept: T[] = [];
  const excluded: ExcludedTopicNote[] = [];
  topics.forEach((topic, index) => {
    const phrase = hits[index];
    if (phrase) {
      excluded.push({ title: topic.title, reason: `Belgende kapsam dışı deniyor: «${phrase}». Listeye almadık; istersen geri ekleyebilirsin.` });
      return;
    }
    newIndex.set(index, kept.length);
    kept.push(topic);
  });
  const remapped = units
    .map((unit) => ({
      title: unit.title,
      topicIndexes: unit.topicIndexes.flatMap((index) => (newIndex.has(index) ? [newIndex.get(index)!] : [])),
    }))
    .filter((unit) => unit.topicIndexes.length);
  return { topics: kept, units: remapped, excluded };
}
