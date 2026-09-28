import { describe, expect, it } from "vitest";
import { formatDocumentProcessProgress, processProgressFingerprint } from "@/lib/documents/process-progress-label";
import { MAP_LEASE_MS } from "@/lib/documents/pdf-learning-v2-lease";
import { LEASE_BUSY_ALIVE_MS, stallCursorKey } from "@/lib/documents/process-session";
import { analyzePage } from "@/lib/documents/page-analysis";
import { topicMapWindows } from "@/lib/documents/pdf-learning-v2";

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
    ).toBe("Konular çıkarılıyor: 7/17");
    expect(
      formatDocumentProcessProgress({
        phase: "map",
        stage: "outline",
        windowsDone: 17,
        windowsTotal: 17,
      }),
    ).toBe("Konular düzenleniyor…");
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

  it("windows a long page list into 12-page chunks", () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({ n: i + 1 }));
    const windows = topicMapWindows(pages);
    expect(windows.length).toBe(17);
    expect(windows[0]).toHaveLength(12);
    expect(windows[windows.length - 1]!.length).toBeLessThanOrEqual(12);
  });
});
