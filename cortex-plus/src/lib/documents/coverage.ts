/**
 * Coverage audit: every instructional page should link to ≥1 topic.
 */

import type { PageAnalysis, PageKind } from "@/lib/documents/page-analysis";
import type { TopicDraft } from "@/lib/documents/topic-map";

export type CoverageStatus = "complete" | "incomplete" | "blocked";

export type CoverageReport = {
  totalPages: number;
  contentPages: number;
  coveredPages: number;
  skippedPages: { pageNumber: number; kind: PageKind; reason: string }[];
  unreadablePages: { pageNumber: number; reason: string }[];
  uncoveredContentPages: { pageNumber: number; reason: string }[];
  mergedTitles: { kept: string; dropped: string[] }[];
  status: CoverageStatus;
  summary: string;
};

const SKIP_KINDS: PageKind[] = ["cover", "toc", "answer_key", "blank"];

export function buildCoverageReport(
  pages: PageAnalysis[],
  topics: TopicDraft[],
  mergedTitles: { kept: string; dropped: string[] }[] = [],
): CoverageReport {
  const linkedPages = new Set<number>();
  for (const topic of topics) {
    for (const pageNumber of topic.pageNumbers) linkedPages.add(pageNumber);
  }

  const skippedPages: CoverageReport["skippedPages"] = [];
  const unreadablePages: CoverageReport["unreadablePages"] = [];
  const uncoveredContentPages: CoverageReport["uncoveredContentPages"] = [];

  let contentPages = 0;
  let coveredPages = 0;

  for (const page of pages) {
    if (SKIP_KINDS.includes(page.pageKind)) {
      skippedPages.push({
        pageNumber: page.pageNumber,
        kind: page.pageKind,
        reason:
          page.pageKind === "cover"
            ? "Kapak sayfası — öğretim kapsamı dışı."
            : page.pageKind === "toc"
              ? "İçindekiler — öğretim kapsamı dışı."
              : page.pageKind === "answer_key"
                ? "Cevap anahtarı — öğretim kapsamı dışı."
                : "Boş sayfa.",
      });
      continue;
    }

    if (page.pageKind === "unreadable" || (!page.extractionOk && page.charCount < 40)) {
      unreadablePages.push({
        pageNumber: page.pageNumber,
        reason:
          page.uncertainRegions[0] ??
          "Metin çıkarılamadı; OCR/görsel analiz gerekir.",
      });
      continue;
    }

    contentPages += 1;
    if (linkedPages.has(page.pageNumber)) {
      coveredPages += 1;
    } else {
      uncoveredContentPages.push({
        pageNumber: page.pageNumber,
        reason: "İçerik sayfası hiçbir konuya bağlanmadı.",
      });
    }
  }

  let status: CoverageStatus = "complete";
  if (unreadablePages.length > 0 && contentPages === 0) status = "blocked";
  else if (uncoveredContentPages.length > 0 || unreadablePages.length > 0) {
    status = "incomplete";
  }

  const summary =
    status === "complete"
      ? `Tüm öğretim sayfaları (${coveredPages}/${contentPages}) en az bir konuya bağlı.`
      : status === "blocked"
        ? "Belgeden okunabilir öğretim sayfası çıkarılamadı."
        : [
            uncoveredContentPages.length
              ? `${uncoveredContentPages.length} içerik sayfası konuya bağlanmadı.`
              : null,
            unreadablePages.length
              ? `${unreadablePages.length} sayfa okunamadı veya belirsiz.`
              : null,
            skippedPages.length
              ? `${skippedPages.length} sayfa kapak/içindekiler/cevap olarak atlandı.`
              : null,
          ]
            .filter(Boolean)
            .join(" ");

  return {
    totalPages: pages.length,
    contentPages,
    coveredPages,
    skippedPages,
    unreadablePages,
    uncoveredContentPages,
    mergedTitles,
    status,
    summary,
  };
}
