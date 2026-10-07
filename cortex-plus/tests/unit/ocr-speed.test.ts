/** B7: OCR starts while pages still render, backs off on 429 within the deadline, adapts its pool. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractText: vi.fn(),
  renderPdfPages: vi.fn(),
  extractImageText: vi.fn(),
}));

vi.mock("@/lib/documents/extract-text", () => ({ extractText: mocks.extractText }));
vi.mock("@/lib/documents/render-pdf-pages", () => ({ renderPdfPages: mocks.renderPdfPages, BLANK_INK_RATIO: 0.002 }));
vi.mock("@/lib/documents/extract-image-text", () => ({ extractImageText: mocks.extractImageText }));
vi.mock("@/lib/auth/roles", () => ({ isAdminUser: async () => true, AdminCheckError: class extends Error {} }));
vi.mock("@/lib/documents/photo-quota", () => ({ planTier: async () => "free", photoPageLimit: () => 0 }));
vi.mock("@/lib/credits/service", () => ({ reserveCredits: vi.fn(), refundCredits: vi.fn(), recordUsage: vi.fn(), commitCredits: vi.fn() }));
vi.mock("@/lib/rag/pipeline", () => ({ chunkText: vi.fn(), embedTexts: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { OPENAI_STANDARD_MODEL: "gpt-test" } }));
vi.mock("@/lib/observability/ops-log", () => ({ logOpsEvent: vi.fn() }));

const { readPdfBatch, rememberedOcrLimit, OCR_START_CONCURRENCY, OCR_MIN_CONCURRENCY, OCR_PAGE_CONCURRENCY } = await import("@/lib/documents/pdf-ingestion");

const scanned = (n: number) => ({ png: Buffer.from(`p${n}`), inkRatio: 0.05, hasImageContent: true, scanRenderFailed: false, pageNumber: n });
const ok = (rateLimited = false) => ({ pages: ["Taranmış sayfanın okunan metni yeterince uzun bir paragraf."], ok: true, model: "m", tokensIn: 0, tokensOut: 0, rateLimited });
const service = { rpc: vi.fn(async () => ({ data: true, error: null })) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scanned PDF step", () => {
  it("starts OCR on page 1 before the last page is rendered", async () => {
    const pages = 6;
    mocks.extractText.mockResolvedValue({ ok: false, total: pages, pages: Array(pages).fill("") });
    const events: string[] = [];
    mocks.renderPdfPages.mockImplementation(async (_b: Buffer, count: number, _f: number, opts: any) => {
      const out = [];
      for (let i = 0; i < count; i += 1) {
        await new Promise((r) => setTimeout(r, 5));
        const page = scanned(i + 1);
        out.push(page);
        events.push(`render ${i + 1}`);
        opts?.onPage?.(page, i);
      }
      return { pages: out, total: count };
    });
    mocks.extractImageText.mockImplementation(async () => {
      events.push("ocr");
      return ok();
    });
    const read = await readPdfBatch(service as never, Buffer.from("pdf"), "d-render", "u", 1, pages, Date.now() + 60_000);
    expect(read.pages).toHaveLength(pages);
    expect(events.indexOf("ocr")).toBeLessThan(events.indexOf(`render ${pages}`));
  });

  it("halves the pool on 429 and grows it back on clean pages", async () => {
    const pages = 40;
    mocks.extractText.mockResolvedValue({ ok: false, total: pages, pages: Array(pages).fill("") });
    mocks.renderPdfPages.mockResolvedValue({ pages: Array.from({ length: pages }, (_, i) => scanned(i + 1)), total: pages });
    let inFlight = 0;
    const seen: number[] = [];
    let n = 0;
    mocks.extractImageText.mockImplementation(async () => {
      inFlight += 1;
      const call = ++n;
      seen.push(inFlight);
      await new Promise((r) => setTimeout(r, 3));
      inFlight -= 1;
      return ok(call <= 12); // the first wave hits the rate limit
    });
    const read = await readPdfBatch(service as never, Buffer.from("pdf"), "d-429", "u", 1, pages, Date.now() + 60_000);
    expect(read.pages).toHaveLength(pages);
    expect(Math.max(...seen.slice(0, 12))).toBe(OCR_START_CONCURRENCY);
    // After the 429 wave the pool sat at the floor, then climbed again.
    expect(seen.slice(12, 16).every((v) => v <= OCR_MIN_CONCURRENCY)).toBe(true);
    expect(Math.max(...seen.slice(-8))).toBeGreaterThan(OCR_MIN_CONCURRENCY);
  });

  it("keeps the grown pool for the next 40-page step instead of dropping back to 12", async () => {
    const pages = 40;
    mocks.extractText.mockResolvedValue({ ok: false, total: 80, pages: Array(pages).fill("") });
    mocks.renderPdfPages.mockImplementation(async (_b: Buffer, count: number, first: number) => ({
      pages: Array.from({ length: count }, (_, i) => scanned(first + i)), total: 80,
    }));
    let inFlight = 0;
    let seen: number[] = [];
    mocks.extractImageText.mockImplementation(async () => {
      inFlight += 1;
      seen.push(inFlight);
      await new Promise((r) => setTimeout(r, 3));
      inFlight -= 1;
      return ok();
    });
    await readPdfBatch(service as never, Buffer.from("pdf"), "d-steps", "u", 1, pages, Date.now() + 60_000);
    const grown = rememberedOcrLimit("d-steps")!;
    expect(grown).toBeGreaterThan(OCR_START_CONCURRENCY);
    expect(grown).toBeLessThanOrEqual(OCR_PAGE_CONCURRENCY);

    seen = [];
    await readPdfBatch(service as never, Buffer.from("pdf"), "d-steps", "u", 41, pages, Date.now() + 60_000);
    // Step 2 opens at the grown size — the first wave is wider than 12.
    expect(Math.max(...seen.slice(0, grown))).toBe(grown);
    // Another document still starts at the start value.
    expect(rememberedOcrLimit("d-other")).toBeNull();
  });
});

describe("OCR 429 backoff respects the deadline", () => {
  it("never sleeps past deadlineMs", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/documents/extract-image-text");
    vi.doMock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "k", OPENAI_STANDARD_MODEL: "mini", OPENAI_ADVANCED_MODEL: "big" } }));
    vi.doMock("@/lib/ai/moderation", () => ({ moderate: async () => ({ action: "allow" }) }));
    const create = vi.fn(async () => {
      const error = Object.assign(new Error("rate"), { status: 429, headers: { get: () => "20" } });
      throw error;
    });
    vi.doMock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
    const { extractImageText } = await import("@/lib/documents/extract-image-text");
    const started = Date.now();
    const result = await extractImageText(Buffer.from("png"), "image/png", { deadlineMs: started + 6_000 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
