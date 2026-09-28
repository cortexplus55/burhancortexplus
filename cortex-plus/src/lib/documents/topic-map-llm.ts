import "server-only";
import { pageUsableForLesson, type PageAnalysis } from "@/lib/documents/page-analysis";
import { draftFromLlmTopic, type TopicDraft } from "@/lib/documents/topic-map";
import {
  isCalloutLabel,
  isProcedureStep,
  isRunningHeader,
  isSatelliteSection,
} from "@/lib/documents/topic-title";
import { foldedPageHost } from "@/lib/documents/topic-fold";

/** Page selection and page→topic attachment shared by the outline paths. */

/**
 * Haritaya girecek sayfalar.
 *
 * Zengin sayfa (öğretim veya belirsiz) varsa yalnızca onlar. PDF yolu
 * bu yüzden değişmez: kısa bir OCR artığı haritaya karışmaz.
 *
 * Hiç zengin sayfa yoksa kısa slaytlar buraya girer. 40 karakterin
 * altındaki slayt "okunamadı" sayılıyor; metin duruyor, harita ise
 * boş sayfa sanıp "konular çıkarılamadı" diyordu.
 */
export function pagesForTopicMap(pages: PageAnalysis[]): PageAnalysis[] {
  // Empty / blank pages and failed OCR pages never feed the topic map.
  // Short text-layer slides stay eligible for the pageUsableForLesson fallback
  // even when analyzePage marks them unreadable (extractionOk=false, method none).
  // TOC pages are kept (labelled in the oneshot corpus) so the model sees the
  // book's own structure.
  const eligible = pages.filter((page) => {
    if (page.pageKind === "blank" || page.charCount <= 0) return false;
    if (page.extractionOk === false && page.extractionMethod === "ocr") return false;
    return true;
  });
  const rich = eligible.filter(
    (page) =>
      page.pageKind === "content" ||
      page.pageKind === "uncertain" ||
      page.pageKind === "toc",
  );
  if (rich.length > 0) return rich;

  // Kısa slayt yolu — ders okuyucusuyla aynı pageUsableForLesson kuralı.
  return eligible.filter((page) => pageUsableForLesson(page));
}

/** Türkçe katlama — karşılaştırma için. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/**
 * Sayfanın başlıkları hangi konuyu işaret ediyor?
 *
 * Ölçü: başlığın ayırt edici kelimelerinin çoğu bir konu başlığında
 * geçiyorsa sayfa o konuya aittir. Hiçbiri yeterince tutmuyorsa null —
 * o zaman çağıran taraf "en yakın önceki" ölçüsüne düşüyor.
 */
export function topicForHeadings<T extends { title: string }>(
  topics: T[],
  headings: string[],
): T | null {
  for (const heading of headings) {
    // Kutu, adım ve tekrar bir bölüm adı gibi okununca sayfa yanlış konuya
    // gider: "3) Enerji denklemi" bütün tekrar sayfasını SFEE'ye taşıyordu.
    if (
      isRunningHeader(heading) ||
      isCalloutLabel(heading) ||
      isProcedureStep(heading) ||
      isSatelliteSection(heading)
    ) {
      continue;
    }
    const words = fold(heading)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4);
    if (words.length < 2) continue;
    for (const topic of topics) {
      const title = fold(topic.title);
      const hits = words.filter((word) => title.includes(word.slice(0, 5)));
      if (hits.length / words.length >= 0.6) return topic;
    }
  }
  return null;
}

/**
 * Atlanan sayfaları ait oldukları konuya bağla, sonra kaynak özetini yenile.
 * Modelden sonra geri eklenen bölüm listenin sonunda olabilir. Önceki konuyu
 * dizi sırasından seçmek, örneğin 18. sayfayı 15 yerine 7. sayfaya bağlardı.
 */
export function completeTopicPageLinks(
  topics: TopicDraft[],
  pages: PageAnalysis[],
): TopicDraft[] {
  if (!topics.length) return [];
  const ordered = topics
    .map((topic) => ({ ...topic, pageNumbers: [...topic.pageNumbers].sort((a, b) => a - b) }))
    .sort((a, b) => (a.pageNumbers[0] ?? Infinity) - (b.pageNumbers[0] ?? Infinity));
  const linked = new Set(ordered.flatMap((topic) => topic.pageNumbers));
  const contentPages = pages
    .filter((page) => page.pageKind === "content" || page.pageKind === "uncertain")
    .sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of contentPages) {
    if (linked.has(page.pageNumber)) continue;
    let host = topicForHeadings(ordered, page.headings ?? []);
    // Çözümlü örnek ve tekrar, belgenin sonunda dursa da anlattığı
    // kavrama gider. "En yakın önceki" o sayfayı komşu bölüme yazıyordu.
    if (!host) host = foldedPageHost(ordered, page.headings ?? []);
    if (!host) {
      host = ordered[0];
      let closestStart = Number.NEGATIVE_INFINITY;
      for (const topic of ordered) {
        const start = topic.pageNumbers[0] ?? Infinity;
        if (start <= page.pageNumber && start > closestStart) {
          host = topic;
          closestStart = start;
        }
      }
    }
    host.pageNumbers = [...new Set([...host.pageNumbers, page.pageNumber])].sort((a, b) => a - b);
    linked.add(page.pageNumber);
  }

  return ordered
    .sort((a, b) => (a.pageNumbers[0] ?? Infinity) - (b.pageNumbers[0] ?? Infinity))
    .map((topic, index) => ({
      ...draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, pages, index),
      prerequisites: topic.prerequisites,
      mergeKey: topic.mergeKey,
    }));
}
