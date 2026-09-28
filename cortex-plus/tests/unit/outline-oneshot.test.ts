import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMaterialCorpus,
  splitCorpusForContext,
  validateOneShotOutline,
  selectOutlineModel,
  normalizeOutlineTokens,
  topicTextGrounded,
  pageTextMapFromFiles,
  ONESHOT_MAX_INPUT_CHARS,
  OUTLINE_MINI_PAGE_LIMIT,
  type OneShotOutlineDraft,
} from "@/lib/documents/outline-oneshot";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STRONG_MODEL: "gpt-4.1",
  },
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

function groundedDraft(overrides?: Partial<OneShotOutlineDraft["units"][0]["topics"][0]>): OneShotOutlineDraft {
  return {
    units: [
      {
        title: "Temel Kavramlar",
        examWeight: "high",
        topics: [
          {
            id: "t1",
            title: "Hukukun Kaynakları",
            whyLearn: "Kaynak türlerini ayırt edebileceksin.",
            description: "Kaynaklar",
            pageStart: 1,
            pageEnd: 2,
            examWeight: "high",
            likelyAsked: ["Yazılı kaynaklar", "Örf ve âdet"],
            prerequisiteIds: [],
            ...overrides,
          },
        ],
      },
    ],
  };
}

const GROUND_PAGES = [
  page(1, "Hukukun kaynakları yazılı kaynaklar ve örf âdet anlatılır.", ["Hukukun Kaynakları"]),
  page(2, "Hak ehliyeti ve kaynak türleri devam eder.", ["Hak Ehliyeti"]),
];

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

  it("builds multi-file corpus", () => {
    const corpus = buildMaterialCorpus([
      { fileName: "a.pdf", pages: [{ pageNumber: 1, text: "A metni" }] },
      { fileName: "b.pdf", pages: [{ pageNumber: 1, text: "B metni" }] },
    ]);
    expect(corpus).toContain("=== Dosya: a.pdf ===");
    expect(corpus).toContain("=== Dosya: b.pdf ===");
  });
});

describe("selectOutlineModel", () => {
  it("routes ≤30 pages to gpt-4o-mini", () => {
    const choice = selectOutlineModel({ pageCount: 30, corpusChars: 10_000 });
    expect(choice.tier).toBe("standard");
    expect(choice.model).toBe("gpt-4o-mini");
  });

  it("routes >30 pages to gpt-4.1", () => {
    const choice = selectOutlineModel({
      pageCount: OUTLINE_MINI_PAGE_LIMIT + 1,
      corpusChars: 10_000,
    });
    expect(choice.tier).toBe("strong");
    expect(choice.model).toBe("gpt-4.1");
    expect(choice.reason).toBe("page_count");
  });

  it("routes oversized corpus to gpt-4.1 even under 30 pages", () => {
    const choice = selectOutlineModel({
      pageCount: 10,
      corpusChars: ONESHOT_MAX_INPUT_CHARS + 1,
    });
    expect(choice.tier).toBe("strong");
    expect(choice.reason).toBe("corpus_size");
  });
});

describe("token grounding", () => {
  it("normalizes Turkish tokens without fixture subject words", () => {
    const tokens = normalizeOutlineTokens("Hukukun Kaynakları ve Örf");
    expect(tokens).toContain("hukukun");
    expect(tokens).toContain("kaynaklari");
    expect(tokens).not.toContain("ve");
  });

  it("accepts topics whose title overlaps cited page text", () => {
    const pageTexts = pageTextMapFromFiles([
      {
        fileName: "x.pdf",
        pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
      },
    ]);
    expect(
      topicTextGrounded({
        title: "Hukukun Kaynakları",
        whyLearn: "Kaynak türlerini ayırt edebileceksin.",
        likelyAsked: ["Yazılı kaynaklar"],
        pageStart: 1,
        pageEnd: 2,
        pageTexts,
      }),
    ).toBe(true);
  });

  it("rejects fabricated topics on unrelated pages", () => {
    const pageTexts = pageTextMapFromFiles([
      {
        fileName: "x.pdf",
        pages: [{ pageNumber: 1, text: "Mol kavramı ve Avogadro sayısı anlatılır." }],
      },
    ]);
    expect(
      topicTextGrounded({
        title: "Anayasa Mahkemesi Kararları",
        whyLearn: "Yargı denetimini öğreneceksin.",
        likelyAsked: ["İptal davası"],
        pageStart: 1,
        pageEnd: 1,
        pageTexts,
      }),
    ).toBe(false);
  });
});

describe("validateOneShotOutline", () => {
  it("accepts a clean outline and expands page ranges", () => {
    const pageTexts = pageTextMapFromFiles([
      {
        fileName: "x.pdf",
        pages: [
          { pageNumber: 10, text: "TBMM seçimleri ve seçim dönemi anlatılır." },
          { pageNumber: 11, text: "Seçim dönemi devam." },
          { pageNumber: 12, text: "TBMM seçim sistemi." },
        ],
      },
    ]);
    const draft = {
      units: [
        {
          title: "Yasama",
          topics: [
            {
              title: "TBMM Seçimleri",
              description: "Seçim dönemi",
              whyLearn: "TBMM seçim dönemi",
              pageStart: 10,
              pageEnd: 12,
              likelyAsked: ["Seçim dönemi"],
            },
          ],
        },
      ],
    } as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, 100, pageTexts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized[0]!.topics[0]!.pageNumbers).toEqual([10, 11, 12]);
    }
  });

  it("rejects Diğer Konular, bad pages, and >40 topics", () => {
    const draft = {
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
    } as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, 10);
    expect(result.ok).toBe(false);
  });

  it("rejects page ranges outside the book", () => {
    const draft = {
      units: [
        {
          title: "Unit",
          topics: [
            { title: "Too far", description: "", pageStart: 5, pageEnd: 999 },
          ],
        },
      ],
    } as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, 20);
    expect(result.ok).toBe(false);
  });

  it("rejects ungrounded topics when page texts are supplied", () => {
    const pageTexts = new Map([[1, "Mol kavramı Avogadro"]]);
    const draft = {
      units: [
        {
          title: "Hukuk",
          topics: [
            {
              title: "Anayasa Mahkemesi",
              whyLearn: "Yargı denetimi",
              pageStart: 1,
              pageEnd: 1,
              likelyAsked: ["İptal"],
            },
          ],
        },
      ],
    } as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, 1, pageTexts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "ungrounded_topic")).toBe(true);
    }
  });
});

describe("buildOutlineOneShot", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("uses gpt-4o-mini for short material with teacher+student fields", async () => {
    mockedGenerate.mockImplementation(async (params) => {
      expect(params.modelOverride).toBe("gpt-4o-mini");
      expect(String(params.userPrompt)).toMatch(/ÖĞRETMEN|öğretmen|examWeight|likelyAsked/i);
      expect(String(params.userPrompt)).toMatch(/UYDURMA|uydurma/i);
      const data = params.parse({
        units: [
          {
            title: "Temel Kavramlar",
            examWeight: "high",
            topics: [
              {
                id: "t1",
                title: "Hukukun Kaynakları",
                whyLearn: "Kaynak türlerini ayırt edebileceksin.",
                description: "Kaynaklar",
                pageStart: 1,
                pageEnd: 2,
                examWeight: "high",
                likelyAsked: ["Yazılı kaynaklar", "Örf ve âdet"],
                prerequisiteIds: [],
              },
              {
                id: "t2",
                title: "Hak Ehliyeti",
                whyLearn: "Hak ehliyeti ile fiil ehliyetini ayıracaksın.",
                pageStart: 2,
                pageEnd: 2,
                examWeight: "medium",
                likelyAsked: ["Hak ehliyeti"],
                prerequisiteIds: ["t1"],
              },
            ],
          },
        ],
      });
      return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      pagesForFallback: GROUND_PAGES,
      examLabel: "KPSS",
      allowModel: true,
    });
    expect(result.fromModel).toBe(true);
    expect(result.path).toBe("single");
    expect(result.retryable).toBe(false);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.examWeight).toBe("high");
    const topics = result.units[0]!.topics;
    expect(topics[0]!.examWeight).toBe("high");
    expect(topics[0]!.likelyAsked).toEqual(["Yazılı kaynaklar", "Örf ve âdet"]);
    expect(topics[0]!.whyLearn).toMatch(/Kaynak/);
    expect(topics[1]!.prerequisiteTitles).toContain("Hukukun Kaynakları");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("routes >30 page material to gpt-4.1 in one call (no split)", async () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      page(
        i + 1,
        `Ünite içerik sayfa ${i + 1}: hukuk kaynakları yasama yürütme yargı idare anlatılır.`,
        [`Konu ${i + 1}`],
      ),
    );
    mockedGenerate.mockImplementation(async (params) => {
      expect(params.modelOverride).toBe("gpt-4.1");
      const data = params.parse({
        units: [
          {
            title: "Hukuk",
            examWeight: "high",
            topics: [
              {
                id: "t1",
                title: "Hukuk kaynakları",
                whyLearn: "Kaynakları öğreneceksin.",
                pageStart: 1,
                pageEnd: 3,
                examWeight: "high",
                likelyAsked: ["Hukuk kaynakları"],
                prerequisiteIds: [],
              },
            ],
          },
        ],
      });
      return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "big.pdf",
          pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      allowModel: true,
    });
    expect(result.path).toBe("single");
    expect(result.model).toBe("gpt-4.1");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("escalates to gpt-4.1 when mini draft fails validation", async () => {
    let calls = 0;
    mockedGenerate.mockImplementation(async (params) => {
      calls += 1;
      if (calls === 1) {
        expect(params.modelOverride).toBe("gpt-4o-mini");
        return {
          ok: true as const,
          data: params.parse({
            units: [
              {
                title: "Diğer Konular",
                topics: [{ title: "Junk", pageStart: 1, pageEnd: 1 }],
              },
            ],
          }),
          usage: { tokensIn: 1, tokensOut: 1 },
        } as never;
      }
      expect(params.modelOverride).toBe("gpt-4.1");
      return {
        ok: true as const,
        data: params.parse(groundedDraft()),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      allowModel: true,
    });
    expect(result.path).toBe("escalation");
    expect(result.fromModel).toBe(true);
    expect(result.model).toBe("gpt-4.1");
    expect(result.units[0]!.title).toBe("Temel Kavramlar");
    expect(mockedGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("runs one repair on the strong model after escalation still fails", async () => {
    let calls = 0;
    mockedGenerate.mockImplementation(async (params) => {
      calls += 1;
      const prompt = String(params.userPrompt ?? "");
      if (prompt.includes("geçersizdi") || prompt.includes("Düzeltmen")) {
        expect(params.modelOverride).toBe("gpt-4.1");
        return {
          ok: true as const,
          data: params.parse(groundedDraft()),
          usage: { tokensIn: 1, tokensOut: 1 },
        } as never;
      }
      // First (mini) and escalation drafts both invent Diğer Konular.
      return {
        ok: true as const,
        data: params.parse({
          units: [
            {
              title: "Diğer Konular",
              topics: [{ title: "Junk", pageStart: 1, pageEnd: 1 }],
            },
          ],
        }),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      allowModel: true,
    });
    expect(result.path).toBe("repair");
    expect(result.fromModel).toBe(true);
    expect(result.units[0]!.title).toBe("Temel Kavramlar");
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("returns empty retryable result when the model fails completely (no fake list)", async () => {
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
    expect(result.path).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.units).toEqual([]);
  });

  it("never invents a Diğer Konular bucket when model is disallowed", async () => {
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
    expect(result.units).toEqual([]);
    expect(result.retryable).toBe(true);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("rejects fabricated page numbers without inventing a fallback map", async () => {
    mockedGenerate.mockImplementation(async (params) => ({
      ok: true as const,
      data: params.parse({
        units: [
          {
            title: "Unit",
            topics: [
              {
                title: "Invented",
                whyLearn: "yok",
                pageStart: 1,
                pageEnd: 999,
              },
            ],
          },
        ],
      }),
      usage: { tokensIn: 1, tokensOut: 1 },
    }) as never);

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: [{ pageNumber: 1, text: "Kısa metin hukuk kaynakları." }],
        },
      ],
      allowModel: true,
    });
    // Escalation + repair also fail the same fabricated draft → empty retry.
    expect(result.fromModel).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.units).toEqual([]);
  });
});
