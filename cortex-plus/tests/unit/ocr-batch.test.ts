import { describe, expect, it } from "vitest";
import {
  OCR_VISION_BATCH_SIZE,
  splitBatchedOcrResponse,
} from "@/lib/documents/extract-image-text";
import { OCR_PAGE_CONCURRENCY, PDF_PAGES_PER_STEP } from "@/lib/documents/pdf-ingestion";

describe("OCR throughput constants", () => {
  it("keeps concurrency in the 20–30 band with large steps", () => {
    expect(OCR_PAGE_CONCURRENCY).toBeGreaterThanOrEqual(20);
    expect(OCR_PAGE_CONCURRENCY).toBeLessThanOrEqual(30);
    expect(PDF_PAGES_PER_STEP).toBeGreaterThanOrEqual(30);
    expect(OCR_VISION_BATCH_SIZE).toBeGreaterThanOrEqual(2);
  });
});

describe("splitBatchedOcrResponse", () => {
  it("parses <<<SAYFA N>>> blocks", () => {
    const raw = [
      "<<<SAYFA 1>>>",
      "Birinci sayfa metni burada yeterince uzun olmalı.",
      "<<<SAYFA 2>>>",
      "İkinci sayfa metni burada yeterince uzun olmalı.",
    ].join("\n");
    const parts = splitBatchedOcrResponse(raw, 2);
    expect(parts[0]).toMatch(/Birinci/);
    expect(parts[1]).toMatch(/İkinci/);
  });

  it("returns null for missing pages", () => {
    const parts = splitBatchedOcrResponse("<<<SAYFA 1>>>\nKısa", 3);
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBeNull();
    expect(parts[2]).toBeNull();
  });
});
