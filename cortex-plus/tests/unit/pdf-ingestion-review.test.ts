import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractText: vi.fn(),
  renderPdfPages: vi.fn(),
  extractImageText: vi.fn(),
  isAdminUser: vi.fn(),
  planTier: vi.fn(),
  photoPageLimit: vi.fn(),
  recordUsage: vi.fn(),
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  embedTexts: vi.fn(),
  chunkText: vi.fn((text: string) => (text.trim() ? [text] : [])),
  logOpsEvent: vi.fn(),
}));

vi.mock("@/lib/documents/extract-text", () => ({ extractText: mocks.extractText }));
vi.mock("@/lib/documents/render-pdf-pages", () => ({
  renderPdfPages: mocks.renderPdfPages,
  BLANK_INK_RATIO: 0.002,
}));
vi.mock("@/lib/documents/extract-image-text", () => ({
  extractImageText: mocks.extractImageText,
}));
vi.mock("@/lib/auth/roles", () => ({
  isAdminUser: mocks.isAdminUser,
  AdminCheckError: class AdminCheckError extends Error {
    code = "admin_check_failed";
  },
}));
vi.mock("@/lib/documents/photo-quota", () => ({
  planTier: mocks.planTier,
  photoPageLimit: mocks.photoPageLimit,
}));
vi.mock("@/lib/credits/service", () => ({
  reserveCredits: mocks.reserveCredits,
  refundCredits: mocks.refundCredits,
  recordUsage: mocks.recordUsage,
  commitCredits: vi.fn(),
}));
vi.mock("@/lib/rag/pipeline", () => ({
  chunkText: mocks.chunkText,
  embedTexts: mocks.embedTexts,
}));
vi.mock("@/lib/env", () => ({ env: { OPENAI_STANDARD_MODEL: "gpt-test" } }));
vi.mock("@/lib/observability/ops-log", () => ({ logOpsEvent: mocks.logOpsEvent }));

const {
  buildDocumentPageRows,
  contiguousDonePrefix,
  readPdfBatch,
} = await import("@/lib/documents/pdf-ingestion");

function fakeUpsertNullingMissingColumns() {
  const inserted: Record<string, unknown>[] = [];
  const api = {
    inserted,
    from() {
      return api;
    },
    upsert(rows: Record<string, unknown>[]) {
      const keys = new Set<string>();
      for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
      for (const row of rows) {
        const normalized: Record<string, unknown> = {};
        for (const key of keys) {
          normalized[key] = Object.prototype.hasOwnProperty.call(row, key)
            ? row[key]
            : null;
        }
        if (normalized.page_kind == null) {
          return {
            select: async () => ({
              data: null,
              error: { message: "null value in column page_kind" },
            }),
          };
        }
        inserted.push(normalized);
      }
      return {
        select: async () => ({
          data: inserted.map((row, i) => ({
            id: `p${i}`,
            page_number: row.page_number,
          })),
          error: null,
        }),
      };
    },
    delete() {
      return {
        eq() {
          return { in: async () => ({ error: null }) };
        },
      };
    },
    insert() {
      return { select: async () => ({ data: [], error: null }) };
    },
  };
  return api;
}

describe("buildDocumentPageRows / saveBatch page_kind", () => {
  it("her satıra page_kind yazar — karışık batch NULL üretmez", () => {
    const rows = buildDocumentPageRows("doc-1", 55, [
      {
        text: "Anayasa maddesi yeterince uzun metin.",
        extractionOk: true,
        extractionMethod: "ocr",
        pageKind: "content",
      },
      {
        text: "",
        extractionOk: true,
        extractionMethod: "none",
        pageKind: "blank",
      },
      {
        text: "",
        extractionOk: false,
        extractionMethod: "ocr",
        pageKind: "unreadable",
      },
    ]);
    expect(rows.every((row) => typeof row.page_kind === "string")).toBe(true);
    expect(rows.map((row) => row.page_kind)).toEqual([
      "content",
      "blank",
      "unreadable",
    ]);
  });

  it("fake PostgREST nulling missing columns: mixed batch succeeds", () => {
    const client = fakeUpsertNullingMissingColumns();
    const rows = buildDocumentPageRows("doc-1", 55, [
      {
        text: "Okunan sayfa metni burada yeterince uzun.",
        extractionOk: true,
        extractionMethod: "ocr",
        pageKind: "content",
      },
      {
        text: "",
        extractionOk: true,
        extractionMethod: "none",
        pageKind: "blank",
      },
    ]);
    const result = client.upsert(rows);
    expect(client.inserted).toHaveLength(2);
    expect(client.inserted.every((row) => row.page_kind != null)).toBe(true);
    expect(result.select).toBeTypeOf("function");
  });

  it("page_kind eksik satır fake client'ta null hatası verir", async () => {
    const client = fakeUpsertNullingMissingColumns();
    // Old bug: only some rows carried page_kind; union columns → NULL.
    const brokenRows = [
      {
        document_id: "doc-1",
        page_number: 55,
        text_content: "ok",
        extraction_ok: true,
        extraction_method: "ocr",
        char_count: 2,
        page_kind: "content",
      },
      {
        document_id: "doc-1",
        page_number: 56,
        text_content: "",
        extraction_ok: true,
        extraction_method: "none",
        char_count: 0,
        // page_kind intentionally omitted
      },
    ];
    const result = await client.upsert(brokenRows).select();
    expect(result.error?.message).toMatch(/page_kind/);
    expect(result.data).toBeNull();
  });
});

describe("contiguousDonePrefix", () => {
  it("ilk unfinished indekste durur", () => {
    expect(contiguousDonePrefix([true, true, false, true])).toBe(2);
    expect(contiguousDonePrefix([true, true, true])).toBe(3);
    expect(contiguousDonePrefix([false, true])).toBe(0);
  });
});

describe("readPdfBatch deadline prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminUser.mockResolvedValue(true);
    mocks.planTier.mockResolvedValue("free");
    mocks.photoPageLimit.mockReturnValue(2);
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.extractText.mockResolvedValue({
      ok: false,
      total: 99,
      pages: ["", "", "", "", "", ""],
    });
    mocks.renderPdfPages.mockResolvedValue({
      total: 99,
      pages: Array.from({ length: 6 }, (_, i) => ({
        png: Buffer.from(`png-${i}`),
        inkRatio: 0.05,
        hasImageContent: true,
        scanRenderFailed: false,
        pageNumber: 55 + i,
      })),
    });
  });

  it("deadline 2/6 sonra keser; nextPage=first+2; 3–6 kaydedilmez", async () => {
    const firstPage = 55;
    const started = 1_000_000;
    let now = started;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    let calls = 0;
    mocks.extractImageText.mockImplementation(async () => {
      calls += 1;
      const n = calls;
      // After the second start, expire the deadline before the next enqueue.
      if (n >= 2) now = started + 200_000;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        pages: [`OCR sayfa metni numarası ${n} yeterince uzun.`],
        ok: true,
        model: "m",
        tokensIn: 1,
        tokensOut: 1,
      };
    });

    const service = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      })),
    };

    const read = await readPdfBatch(
      service as never,
      Buffer.from("pdf"),
      "doc-1",
      "user-1",
      firstPage,
      6,
      started + 10_000,
      null,
      2, // concurrency 2: first wave starts 2, then deadline blocks more
    );

    expect(read.pages).toHaveLength(2);
    expect(firstPage + read.pages.length).toBe(firstPage + 2);
    expect(calls).toBe(2);
    expect(read.pages.every((page) => page.extractionMethod === "ocr")).toBe(true);

    dateSpy.mockRestore();
  });
});

describe("readPdfBatch OCR claim release on quota failure (B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminUser.mockResolvedValue(false);
    mocks.planTier.mockResolvedValue("free");
    mocks.photoPageLimit.mockReturnValue(2);
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.extractText.mockResolvedValue({
      ok: false,
      total: 4,
      pages: ["", "", "", ""],
    });
    mocks.renderPdfPages.mockResolvedValue({
      total: 4,
      pages: Array.from({ length: 4 }, (_, i) => ({
        png: Buffer.from(`png-${i}`),
        inkRatio: 0.05,
        hasImageContent: true,
        scanRenderFailed: false,
        pageNumber: 1 + i,
      })),
    });
  });

  it("quota fail: claimed pages released once; no unhandledRejection", async () => {
    const claimResults = [true, true, false, false];
    let claimCalls = 0;
    const releases: number[] = [];

    mocks.extractImageText.mockImplementation(async () => {
      // Stay in OCR long enough for sibling claim failures to surface.
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        pages: ["OCR sayfa metni yeterince uzun içerik."],
        ok: true,
        model: "m",
        tokensIn: 1,
        tokensOut: 1,
      };
    });

    const service = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === "claim_document_ocr_page") {
          const data = claimResults[claimCalls] ?? false;
          claimCalls += 1;
          return { data, error: null };
        }
        if (name === "release_document_ocr_page") {
          releases.push(Number(args.p_page_number));
          return { data: true, error: null };
        }
        return { data: null, error: null };
      }),
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      })),
    };

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      await expect(
        readPdfBatch(
          service as never,
          Buffer.from("pdf"),
          "doc-1",
          "user-1",
          1,
          4,
          Date.now() + 60_000,
          null,
          4,
        ),
      ).rejects.toThrow("photo_quota_exhausted");

      // Let sibling rejections and finally handlers flush.
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(claimCalls).toBe(4);
      expect(releases.sort((a, b) => a - b)).toEqual([1, 2]);
      expect(releases).toHaveLength(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
