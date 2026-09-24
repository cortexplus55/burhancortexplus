/**
 * Kısa belgede, model konu çıkaramadığında metnin kendisinden tek konu.
 *
 * Eski sezgisel harita bir trigonometri listesine bakıyordu; başka bir
 * dersin belgesine o listenin başlıklarını yazıyordu. Burada liste yok.
 * Başlık sırası belgenin kendi satırları: ilk başlık, olmazsa ilk dolu
 * cümle, o da olmazsa dosya adı. Uzun PDF bu yolu kullanmaz — onu
 * çağıran taraf yalnızca tek konunun zaten yeterli olduğu belgelerde
 * devreye sokar.
 */

import type { PageAnalysis } from "@/lib/documents/page-analysis";
import { draftFromLlmTopic, type TopicMapBuildResult } from "@/lib/documents/topic-map";
import {
  documentTitle,
  normalizeTopicTitle,
  topicTitleIssues,
} from "@/lib/documents/topic-title";

const TRAILING_PUNCT = /[.!?…:;]+$/u;

/**
 * Modelin sonuna nokta veya soru işareti koyduğu başlığı ev stiline çek.
 *
 * Kural "başlık cümle değildir" diyor. Model cümle kurunca başlık eleniyor,
 * elde başka konu kalmayınca haritanın tamamı düşüyordu. Noktayı biz keseriz;
 * "Sayfa 4" gibi gerçekten kötü başlıklar yine elenir.
 */
export function polishModelTitle(title: string): string {
  return normalizeTopicTitle(title).replace(TRAILING_PUNCT, "").replace(/\s+/g, " ").trim();
}

function coerceTopicTitle(raw: string): string | null {
  const text = polishModelTitle(raw);
  if (!text) return null;
  if (!topicTitleIssues(text).length) return text;

  const clause = text.split(/[:—–]/)[0]?.replace(TRAILING_PUNCT, "").trim() ?? "";
  if (clause && clause !== text && !topicTitleIssues(clause).length) return clause;

  const shortened = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
    .replace(TRAILING_PUNCT, "")
    .trim();
  if (shortened && !topicTitleIssues(shortened).length) return shortened;
  return null;
}

function linesOf(page: PageAnalysis): string[] {
  return page.textContent
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.replace(/[^\p{L}]/gu, "").length >= 6);
}

/**
 * Belgeden tek konu başlığı.
 *
 * Sıra sabit: sayfanın kendi başlığı, sonra ilk anlamlı satır, sonra
 * dosya adı. Hiçbiri kurala uymuyorsa null — uydurma konu yok.
 */
export function titleFromExtractedText(
  pages: PageAnalysis[],
  fileName: string,
): string | null {
  for (const page of pages) {
    for (const heading of page.headings) {
      const title = coerceTopicTitle(heading);
      if (title) return title;
    }
  }
  for (const page of pages) {
    for (const line of linesOf(page)) {
      const title = coerceTopicTitle(line);
      if (title) return title;
    }
  }
  const fromFile = fileName ? documentTitle({ fileName }) : "";
  return fromFile || null;
}

function objectiveFromExtractedText(
  pages: PageAnalysis[],
  title: string,
): string | null {
  const folded = title.toLocaleLowerCase("tr");
  for (const page of pages) {
    for (const line of linesOf(page)) {
      const bare = line.replace(TRAILING_PUNCT, "").trim().toLocaleLowerCase("tr");
      if (bare === folded) continue;
      if (line.toLocaleLowerCase("tr") === folded) continue;
      return line.slice(0, 240);
    }
  }
  return null;
}

export function topicMapFromExtractedText(
  contentPages: PageAnalysis[],
  allPages: PageAnalysis[],
  fileName: string,
): TopicMapBuildResult | null {
  if (!contentPages.length) return null;
  const title = titleFromExtractedText(contentPages, fileName);
  if (!title) return null;
  const pageNumbers = contentPages.map((page) => page.pageNumber);
  return {
    topics: [
      draftFromLlmTopic(
        title,
        objectiveFromExtractedText(contentPages, title),
        pageNumbers,
        allPages,
        0,
      ),
    ],
    mergedTitles: [],
  };
}
