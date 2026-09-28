import { describe, expect, it } from "vitest";
import { pagesForTopicMap } from "@/lib/documents/topic-map-llm";
import type { PageAnalysis } from "@/lib/documents/page-analysis";

function page(partial: Partial<PageAnalysis> & Pick<PageAnalysis, "pageNumber">): PageAnalysis {
  return {
    pageNumber: partial.pageNumber,
    textContent: partial.textContent ?? "Örnek ders metni yeterince uzun olmalıdır.",
    extractionOk: partial.extractionOk ?? true,
    pageKind: partial.pageKind ?? "content",
    headings: partial.headings ?? [],
    formulas: partial.formulas ?? [],
    tablesDetected: partial.tablesDetected ?? 0,
    imagesDetected: partial.imagesDetected ?? 0,
    uncertainRegions: partial.uncertainRegions ?? [],
    extractionMethod: partial.extractionMethod ?? "text_layer",
    charCount: partial.charCount ?? (partial.textContent?.length ?? 50),
  };
}

describe("pagesForTopicMap", () => {
  it("extractionOk=false OCR ve blank sayfaları dışlar", () => {
    const rich = page({ pageNumber: 1, pageKind: "content", charCount: 200 });
    const badOcr = page({
      pageNumber: 2,
      extractionOk: false,
      extractionMethod: "ocr",
      pageKind: "unreadable",
      textContent: "Mol oranı",
      charCount: 9,
    });
    const blank = page({
      pageNumber: 3,
      pageKind: "blank",
      textContent: "",
      charCount: 0,
    });
    const result = pagesForTopicMap([rich, badOcr, blank]);
    expect(result.map((p) => p.pageNumber)).toEqual([1]);
  });

  it("zengin sayfa varken kısa slaytları karıştırmaz", () => {
    const rich = page({ pageNumber: 1, pageKind: "content" });
    const short = page({
      pageNumber: 2,
      pageKind: "unreadable",
      extractionOk: false,
      extractionMethod: "none",
      textContent: "Kısa slayt",
      charCount: 10,
    });
    expect(pagesForTopicMap([rich, short]).map((p) => p.pageNumber)).toEqual([1]);
  });
});
