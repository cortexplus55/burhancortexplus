import { describe, expect, it } from "vitest";
import { formatDocumentProcessProgress, processProgressFingerprint } from "@/lib/documents/process-progress-label";
import { MAP_LEASE_MS } from "@/lib/documents/pdf-learning-v2-lease";
import { LEASE_BUSY_ALIVE_MS, stallCursorKey } from "@/lib/documents/process-session";
import { analyzePage } from "@/lib/documents/page-analysis";
import {
  OCR_MIN_CONCURRENCY,
  OCR_PAGE_CONCURRENCY,
  OCR_START_CONCURRENCY,
  PDF_PAGES_PER_STEP,
} from "@/lib/documents/pdf-ingestion";
import {
  OUTLINE_MINI_PAGE_LIMIT,
  outlineStandardModel,
  outlineStrongModel,
} from "@/lib/documents/outline-oneshot";

describe("bounded map round progress labels", () => {
  it("shows extract → windows → outline labels", () => {
    expect(
      formatDocumentProcessProgress({
        phase: "extract",
        nextPage: 7,
        pageCount: 211,
      }),
    ).toBe("Belgen okunuyor: 6/211 sayfa");
    expect(
      formatDocumentProcessProgress({
        phase: "map",
        stage: "windows",
        windowsDone: 7,
        windowsTotal: 17,
      }),
    ).toBe("Çalışma yolu çıkarılıyor…");
    expect(
      formatDocumentProcessProgress({
        phase: "map",
        stage: "outline",
        windowsDone: 17,
        windowsTotal: 17,
      }),
    ).toBe("Çalışma yolu çıkarılıyor…");
    expect(
      formatDocumentProcessProgress({
        phase: "map",
        stage: "oneshot",
        windowsDone: 1,
        windowsTotal: 1,
      }),
    ).toBe("Çalışma yolu çıkarılıyor…");
  });

  it("fingerprints leaseBusy separately and keeps lease alive window", () => {
    expect(
      processProgressFingerprint({
        phase: "map",
        leaseBusy: true,
        windowsDone: 3,
      }),
    ).toBe("map-lease:3");
    expect(LEASE_BUSY_ALIVE_MS).toBe(MAP_LEASE_MS + 30_000);
    expect(stallCursorKey({ phase: "map", windowsDone: 3 }, 3)).toBe("map:3");
  });

  it("preserves extraction_method ocr through analyzePage", () => {
    const analysis = analyzePage(1, "Başlık\nİçerik metni burada yeterince uzun olmalı.", "ocr");
    expect(analysis.extractionMethod).toBe("ocr");
  });

  it("runs OCR with an adaptive pool (4 → start 12 → up to 24) and larger page steps", () => {
    expect(OCR_MIN_CONCURRENCY).toBe(4);
    expect(OCR_START_CONCURRENCY).toBe(12);
    expect(OCR_PAGE_CONCURRENCY).toBe(24);
    expect(PDF_PAGES_PER_STEP).toBeGreaterThanOrEqual(30);
  });

  it("exposes outline model routing constants", () => {
    expect(OUTLINE_MINI_PAGE_LIMIT).toBe(30);
    expect(outlineStandardModel()).toMatch(/mini|4o/i);
    // 8 Ekim 2026: büyük belgenin haritası luna (kredi sistemi v2).
    expect(outlineStrongModel()).toBe("gpt-6-luna");
  });
});
