import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMaterialCorpus,
  splitCorpusForContext,
  validateOneShotOutline,
  ONESHOT_MAX_INPUT_CHARS,
  type OneShotOutlineDraft,
} from "@/lib/documents/outline-oneshot";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));

import { generateJson } from "@/lib/ai/generate";
import { buildOutlineOneShot } from "@/lib/documents/outline-oneshot";
import type { PageAnalysis } from "@/lib/documents/page-analysis";

const mockedGenerate = vi.mocked(generateJson);

function page(n: number, text: string, headings: string[] = []): PageAnalysis {
  return {
    pageNumber: n,
    textContent: text,
    extractionOk: true,
    pageKind: "content",
    headings,
    formulas: [],
    tablesDetected: 0,
    imagesDetected: 0,
    uncertainRegions: [],
    extractionMethod: "ocr",
    charCount: text.length,
  };
}

describe("buildMaterialCorpus / splitCorpusForContext", () => {
  it("prefixes files and keeps page markers", () => {
    const corpus = buildMaterialCorpus([
      {
        fileName: "kitap.pdf",
        pages: [
          { pageNumber: 1, text: "Kapak" },
          { pageNumber: 2, text: "İçindekiler" },
        ],
      },
    ]);
    expect(corpus).toContain("=== Dosya: kitap.pdf ===");
    expect(corpus).toContain("[s.1] Kapak");
    expect(corpus).toContain("[s.2]");
  });

  it("splits long corpus into at most 3 parts on line boundaries", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `[s.${i + 1}] ${"x".repeat(80)}`);
    const corpus = lines.join("\n");
    expect(corpus.length).toBeGreaterThan(ONESHOT_MAX_INPUT_CHARS);
    const parts = splitCorpusForContext(corpus, 50_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(3);
    expect(parts.join("\n").includes("[s.1]")).toBe(true);
  });
});

describe("validateOneShotOutline", () => {
  it("accepts a clean outline and expands page ranges", () => {
    const draft: OneShotOutlineDraft = {
      units: [
        {
          title: "Yasama",
          topics: [
            {
              title: "TBMM Seçimleri",
              description: "Seçim dönemi",
              pageStart: 10,
              pageEnd: 12,
            },
          ],
        },
      ],
    };
    const result = validateOneShotOutline(draft, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized[0]!.topics[0]!.pageNumbers).toEqual([10, 11, 12]);
    }
  });

  it("rejects Diğer Konular, bad pages, and >40 topics", () => {
    const draft: OneShotOutlineDraft = {
      units: [
        {
          title: "Diğer Konular",
          topics: [{ title: "X", description: "", pageStart: 1, pageEnd: 1 }],
        },
        {
          title: "Unit",
          topics: Array.from({ length: 41 }, (_, i) => ({
            title: `T${i}`,
            description: "",
            pageStart: 1,
            pageEnd: 1,
          })),
        },
      ],
    };
    const result = validateOneShotOutline(draft, 10);
    expect(result.ok).toBe(false);
  });

  it("rejects page ranges outside the book", () => {
    const draft: OneShotOutlineDraft = {
      units: [
        {
          title: "Unit",
          topics: [
            { title: "Too far", description: "", pageStart: 5, pageEnd: 999 },
          ],
        },
      ],
    };
    const result = validateOneShotOutline(draft, 20);
    expect(result.ok).toBe(false);
  });
});

describe("buildOutlineOneShot", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("uses a single model call for short material", async () => {
    mockedGenerate.mockImplementation(async (params) => {
      const data = params.parse({
        units: [
          {
            title: "Temel Kavramlar",
            topics: [
              {
                title: "Hukukun Kaynakları",
                description: "Kaynaklar",
                pageStart: 1,
                pageEnd: 2,
              },
            ],
          },
        ],
      });
      return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
    });

    const pages = [
      page(1, "Hukukun kaynakları anlatılır.", ["Hukukun Kaynakları"]),
      page(2, "Devam.", ["Hukukun Kaynakları"]),
    ];
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      pagesForFallback: pages,
      allowModel: true,
    });
    expect(result.fromModel).toBe(true);
    expect(result.path).toBe("single");
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.title).toBe("Temel Kavramlar");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("runs repair when the first draft fails guardrails", async () => {
    let calls = 0;
    mockedGenerate.mockImplementation(async (params) => {
      calls += 1;
      const raw =
        calls === 1
          ? {
              units: [
                {
                  title: "Diğer Konular",
                  topics: [
                    {
                      title: "Junk",
                      description: "",
                      pageStart: 1,
                      pageEnd: 1,
                    },
                  ],
                },
              ],
            }
          : {
              units: [
                {
                  title: "Yasama",
                  topics: [
                    {
                      title: "Kanun Yapımı",
                      description: "Süreç",
                      pageStart: 1,
                      pageEnd: 1,
                    },
                  ],
                },
              ],
            };
      return {
        ok: true as const,
        data: params.parse(raw),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    const pages = [page(1, "Kanun yapımı", ["Kanun Yapımı"])];
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: [{ pageNumber: 1, text: "Kanun yapımı" }],
        },
      ],
      pagesForFallback: pages,
      allowModel: true,
    });
    expect(result.path).toBe("repair");
    expect(result.units[0]!.title).toBe("Yasama");
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
  });

  it("falls back to headings when the model fails completely", async () => {
    mockedGenerate.mockRejectedValue(new Error("network"));
    const pages = [
      page(1, "Bölüm 1 Mol Kavramı\nAçıklama.", ["Bölüm 1 Mol Kavramı"]),
      page(2, "Bölüm 2 Mol Kütlesi\nAçıklama.", ["Bölüm 2 Mol Kütlesi"]),
    ];
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "kimya.pdf",
          pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      pagesForFallback: pages,
      allowModel: true,
    });
    expect(result.fromModel).toBe(false);
    expect(result.path).toBe("fallback");
    expect(result.units.length).toBeGreaterThan(0);
    const titles = result.units.flatMap((u) => u.topics.map((t) => t.title)).join(" ");
    expect(titles).toMatch(/Mol/i);
    // Fallback must not invent pages outside the material
    for (const unit of result.units) {
      for (const topic of unit.topics) {
        for (const p of topic.pageNumbers) {
          expect(p).toBeGreaterThanOrEqual(1);
          expect(p).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("splits long material, outlines in parallel, then merges", async () => {
    const huge = "y".repeat(120_000);
    const corpusPages = Array.from({ length: 3 }, (_, i) => ({
      pageNumber: i + 1,
      text: `[chunk ${i}] ${huge}`,
    }));
    // Force split by building a corpus larger than the budget.
    mockedGenerate.mockImplementation(async (params) => {
      const prompt = String(params.userPrompt ?? "");
      const isMerge = prompt.includes("Kısmi taslak");
      const data = params.parse({
        units: [
          {
            title: isMerge ? "Birleşik Ünite" : "Parça Ünitesi",
            topics: [
              {
                title: isMerge ? "Birleşik Konu" : "Parça Konu",
                description: "x",
                pageStart: 1,
                pageEnd: 1,
              },
            ],
          },
        ],
      });
      return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
    });

    const pages = corpusPages.map((p) => page(p.pageNumber, p.text, ["Başlık"]));
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [{ fileName: "long.pdf", pages: corpusPages }],
      pagesForFallback: pages,
      allowModel: true,
    });
    expect(result.path).toBe("split_merge");
    expect(result.fromModel).toBe(true);
    expect(result.units[0]!.title).toBe("Birleşik Ünite");
    // 2+ partials + 1 merge
    expect(mockedGenerate.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("never invents a Diğer Konular bucket in fallback", async () => {
    mockedGenerate.mockRejectedValue(new Error("down"));
    const pages = Array.from({ length: 20 }, (_, i) =>
      page(i + 1, `Konu ${i + 1} metni burada yeterince uzun.`, [`Konu Başlığı ${i + 1}`]),
    );
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "x.pdf",
          pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      pagesForFallback: pages,
      allowModel: false,
    });
    const unitTitles = result.units.map((u) => u.title);
    expect(unitTitles.some((t) => /diğer konular/i.test(t))).toBe(false);
  });
});
