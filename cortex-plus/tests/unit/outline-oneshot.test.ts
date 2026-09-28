import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMaterialCorpus,
  splitCorpusForContext,
  splitFilesForOutline,
  needsForceSplit,
  validateOneShotOutline,
  selectOutlineModel,
  normalizeOutlineTokens,
  topicTextGrounded,
  pageTextMapFromFiles,
  pageKey,
  stemOutlineToken,
  trimOneShotDraft,
  oneShotJsonSchema,
  oneShotOutlineSchema,
  ONESHOT_MAX_INPUT_CHARS,
  ONESHOT_FORCE_SPLIT_PAGES,
  ONESHOT_FORCE_SPLIT_CHARS,
  OUTLINE_MINI_PAGE_LIMIT,
  OUTLINE_CALL_TIMEOUT_MS,
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
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
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
            fileIndex: overrides?.fileIndex ?? 0,
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
  it("prefixes files and keeps file-qualified page markers", () => {
    const corpus = buildMaterialCorpus([
      {
        fileName: "kitap.pdf",
        pages: [
          { pageNumber: 1, text: "Kapak" },
          { pageNumber: 2, text: "İçindekiler" },
        ],
      },
    ]);
    expect(corpus).toContain("=== Dosya d1: kitap.pdf ===");
    expect(corpus).toContain("[d1 s.1] Kapak");
    expect(corpus).toContain("[d1 s.2]");
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

  it("builds multi-file corpus with per-file markers", () => {
    const corpus = buildMaterialCorpus([
      { fileName: "a.pdf", pages: [{ pageNumber: 1, text: "A metni" }] },
      { fileName: "b.pdf", pages: [{ pageNumber: 1, text: "B metni" }] },
    ]);
    expect(corpus).toContain("=== Dosya d1: a.pdf ===");
    expect(corpus).toContain("=== Dosya d2: b.pdf ===");
    expect(corpus).toContain("[d1 s.1] A metni");
    expect(corpus).toContain("[d2 s.1] B metni");
  });

  it("keys page texts by file so page 1 of two files never merges", () => {
    const map = pageTextMapFromFiles([
      { fileName: "a.pdf", pages: [{ pageNumber: 1, text: "A metni" }] },
      { fileName: "b.pdf", pages: [{ pageNumber: 1, text: "B metni" }] },
    ]);
    expect(map.get(pageKey(0, 1))).toBe("A metni");
    expect(map.get(pageKey(1, 1))).toBe("B metni");
  });

  it("force-splits at ~1000 pages or ~700k-token char budget", () => {
    expect(needsForceSplit({ pageCount: ONESHOT_FORCE_SPLIT_PAGES, corpusChars: 10 })).toBe(true);
    expect(needsForceSplit({ pageCount: 10, corpusChars: ONESHOT_FORCE_SPLIT_CHARS + 1 })).toBe(
      true,
    );
    expect(needsForceSplit({ pageCount: 40, corpusChars: 100_000 })).toBe(false);
  });

  it("splits files on page boundaries without breaking mid-page", () => {
    const files = [
      {
        fileName: "huge.pdf",
        pages: Array.from({ length: 20 }, (_, i) => ({
          pageNumber: i + 1,
          text: "x".repeat(30_000),
        })),
      },
    ];
    const parts = splitFilesForOutline(files, { maxCharsPerPart: 80_000, maxParts: 4 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(4);
    const pageNumbers = parts.flatMap((part) =>
      part.flatMap((f) => f.pages.map((p) => p.pageNumber)),
    );
    expect(pageNumbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
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
    expect(tokens).toContain("hukuk");
    expect(tokens).toContain("kaynak");
    expect(tokens).not.toContain("ve");
  });

  it("stems Turkish inflections onto a shared stem", () => {
    expect(stemOutlineToken("kaynaklari")).toBe(stemOutlineToken("kaynak"));
    expect(stemOutlineToken("konular")).toBe(stemOutlineToken("konu"));
    expect(stemOutlineToken("secimleri")).toBe(stemOutlineToken("secim"));
    expect(stemOutlineToken("mahkemesi")).toBe(stemOutlineToken("mahkeme"));
    // Short words are left alone — over-stemming invents matches.
    expect(stemOutlineToken("mol")).toBe("mol");
    expect(stemOutlineToken("atom")).toBe("atom");
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

  it("rejects at least 8 of 10 fabricated topics against a chemistry corpus", () => {
    const pageTexts = pageTextMapFromFiles([
      {
        fileName: "kimya.pdf",
        pages: [
          {
            pageNumber: 1,
            text: "Mol kavramı ve Avogadro sayısı kimyasal hesaplamaların temelidir.",
          },
          {
            pageNumber: 2,
            text: "Mol kütlesi hesaplama yöntemleri ve bağıl atom kütlesi anlatılır.",
          },
          {
            pageNumber: 3,
            text: "Kimyasal tepkimelerde denklem denkleştirme ve tepkime türleri.",
          },
        ],
      },
    ]);
    const fabricated = [
      { title: "Anayasa Mahkemesi Kararları", whyLearn: "Yargı denetimini öğreneceksin.", likelyAsked: ["İptal davası"] },
      { title: "Cumhuriyetin İlanı", whyLearn: "Tarihsel süreci öğreneceksin.", likelyAsked: ["Saltanatın kaldırılması"] },
      { title: "Borçlar Hukukunda Sözleşme", whyLearn: "Sözleşme kurulmasını öğreneceksin.", likelyAsked: ["İrade beyanı"] },
      { title: "Osmanlı Kuruluş Dönemi", whyLearn: "Beylikten devlete geçişi öğreneceksin.", likelyAsked: ["Söğüt"] },
      { title: "Fransız İhtilali Sonuçları", whyLearn: "Milliyetçiliğin yayılmasını öğreneceksin.", likelyAsked: ["Milliyetçilik"] },
      { title: "Pazarlama Karması Bileşenleri", whyLearn: "Dört bileşeni öğreneceksin.", likelyAsked: ["Tutundurma"] },
      { title: "Elektrik Devre Analizi", whyLearn: "Devre çözümlemeyi öğreneceksin.", likelyAsked: ["Ohm yasası"] },
      { title: "Türk Dili Ses Bilgisi", whyLearn: "Ünlü uyumlarını öğreneceksin.", likelyAsked: ["Büyük ünlü uyumu"] },
      { title: "Mikroekonomide Arz Talep Dengesi", whyLearn: "Piyasa dengesini öğreneceksin.", likelyAsked: ["Talep eğrisi"] },
      { title: "Coğrafi Konum ve İklim Tipleri", whyLearn: "İklim kuşaklarını öğreneceksin.", likelyAsked: ["Akdeniz iklimi"] },
    ];
    const rejected = fabricated.filter(
      (topic) =>
        !topicTextGrounded({ ...topic, pageStart: 1, pageEnd: 3, pageTexts }),
    ).length;
    expect(rejected).toBeGreaterThanOrEqual(8);
  });

  it("needs same-page evidence (or real density) on ranges wider than 8 pages", () => {
    const filler = (n: number) => ({
      pageNumber: n,
      text: `Dolgu paragraf ${n} burada duruyor.`,
    });
    const topic = {
      title: "Nukleotid Replikasyon Semasi",
      whyLearn: "Kromozom telomer sentromer histon plazmit ribozom lizozom golgi",
      likelyAsked: [] as string[],
      pageStart: 1,
      pageEnd: 12,
    };

    const spread = pageTextMapFromFiles([
      {
        fileName: "bio.pdf",
        pages: Array.from({ length: 12 }, (_, i) => {
          if (i === 1) return { pageNumber: 2, text: "Nukleotid zinciri burada anlatilir." };
          if (i === 10) return { pageNumber: 11, text: "Replikasyon sureci burada anlatilir." };
          return filler(i + 1);
        }),
      },
    ]);
    expect(topicTextGrounded({ ...topic, pageTexts: spread })).toBe(false);

    const together = pageTextMapFromFiles([
      {
        fileName: "bio.pdf",
        pages: Array.from({ length: 12 }, (_, i) =>
          i === 1
            ? { pageNumber: 2, text: "Nukleotid zinciri ve replikasyon sureci burada anlatilir." }
            : filler(i + 1),
        ),
      },
    ]);
    expect(topicTextGrounded({ ...topic, pageTexts: together })).toBe(true);
  });
});

describe("trimOneShotDraft", () => {
  it("truncates over-length fields instead of rejecting the outline", () => {
    const trimmed = trimOneShotDraft({
      units: [
        {
          title: "U".repeat(300),
          topics: [
            {
              title: "T".repeat(300),
              whyLearn: "W".repeat(900),
              description: "D".repeat(900),
              pageStart: 1,
              pageEnd: 2,
              likelyAsked: ["a", "b", "c", "d", "e", "f"],
              prerequisiteIds: Array.from({ length: 20 }, (_, i) => `t${i}`),
            },
          ],
        },
      ],
    });
    const unit = trimmed.units[0] as Record<string, unknown>;
    const topic = (unit.topics as Record<string, unknown>[])[0]!;
    expect((unit.title as string).length).toBe(120);
    expect((topic.title as string).length).toBe(120);
    expect((topic.whyLearn as string).length).toBe(400);
    expect((topic.likelyAsked as string[])).toHaveLength(4);
    expect((topic.prerequisiteIds as string[])).toHaveLength(8);
    expect(topic.fileIndex).toBe(0);
    expect(oneShotOutlineSchema.safeParse(trimmed).success).toBe(true);
  });

  it("caps units at 20 and topics at 40 in total", () => {
    const trimmed = trimOneShotDraft({
      units: Array.from({ length: 30 }, (_, u) => ({
        title: `U${u}`,
        topics: Array.from({ length: 10 }, (_, t) => ({
          title: `U${u}T${t}`,
          pageStart: 1,
          pageEnd: 1,
        })),
      })),
    });
    expect(trimmed.units.length).toBeLessThanOrEqual(20);
    const total = trimmed.units.reduce(
      (n, u) => n + (u.topics as unknown[]).length,
      0,
    );
    expect(total).toBe(40);
  });
});

describe("oneShotJsonSchema", () => {
  it("is a strict object schema carrying fileIndex", () => {
    const units = (oneShotJsonSchema.properties as Record<string, never>).units as Record<
      string,
      never
    >;
    const topicProps = (
      ((units.items as Record<string, never>).properties as Record<string, never>)
        .topics as Record<string, never>
    ).items as Record<string, never>;
    expect(oneShotJsonSchema.additionalProperties).toBe(false);
    expect(Object.keys(topicProps.properties as object)).toContain("fileIndex");
    expect(topicProps.required as unknown as string[]).toContain("fileIndex");
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

  it("drops Diğer Konular and topics past 40, keeping the rest", () => {
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
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toHaveLength(1);
      expect(result.normalized[0]!.title).toBe("Unit");
      expect(result.normalized[0]!.topics).toHaveLength(40);
      expect(result.dropped.some((i) => i.code === "diger_bucket")).toBe(true);
      expect(result.dropped.some((i) => i.code === "topic_count")).toBe(true);
    }
  });

  it("keeps grounded topics while dropping the ungrounded one", () => {
    const pageTexts = pageTextMapFromFiles([
      {
        fileName: "x.pdf",
        pages: [
          { pageNumber: 1, text: "Mol kavramı ve Avogadro sayısı anlatılır." },
          { pageNumber: 2, text: "Mol kütlesi hesaplama yöntemleri." },
        ],
      },
    ]);
    const draft = {
      units: [
        {
          title: "Kimya",
          topics: [
            {
              title: "Mol Kavramı",
              whyLearn: "Avogadro sayısını öğreneceksin.",
              pageStart: 1,
              pageEnd: 1,
              likelyAsked: ["Mol kavramı"],
            },
            {
              title: "Anayasa Mahkemesi",
              whyLearn: "Yargı denetimi",
              pageStart: 2,
              pageEnd: 2,
              likelyAsked: ["İptal davası"],
            },
          ],
        },
      ],
    } as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, {
      filePageCounts: [2],
      pageTexts,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized[0]!.topics).toHaveLength(1);
      expect(result.normalized[0]!.topics[0]!.title).toBe("Mol Kavramı");
      expect(result.dropped.some((i) => i.code === "ungrounded_topic")).toBe(true);
    }
  });

  it("bounds page ranges per file and records the topic's fileIndex", () => {
    const pageTexts = pageTextMapFromFiles([
      { fileName: "a.pdf", pages: [{ pageNumber: 1, text: "Mol kavramı Avogadro sayısı." }] },
      { fileName: "b.pdf", pages: [{ pageNumber: 1, text: "Hukukun kaynakları örf âdet." }] },
    ]);
    const draft = {
      units: [
        {
          title: "Karışık",
          topics: [
            {
              title: "Hukukun Kaynakları",
              whyLearn: "Kaynak türleri örf âdet",
              fileIndex: 1,
              pageStart: 1,
              pageEnd: 1,
              likelyAsked: [],
            },
            {
              title: "Olmayan Dosya",
              whyLearn: "Mol kavramı",
              fileIndex: 5,
              pageStart: 1,
              pageEnd: 1,
              likelyAsked: [],
            },
          ],
        },
      ],
    } as unknown as OneShotOutlineDraft;
    const result = validateOneShotOutline(draft, {
      filePageCounts: [1, 1],
      pageTexts,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized[0]!.topics).toHaveLength(1);
      expect(result.normalized[0]!.topics[0]!.fileIndex).toBe(1);
      expect(result.dropped.some((i) => i.code === "page_range")).toBe(true);
    }
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

  it("rejects ungrounded topics when page texts are supplied (legacy number keys)", () => {
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

/** Runs one outline over N files of the given page counts; returns models used. */
async function runSummedRouting(pageCounts: number[]): Promise<string[]> {
  const models: string[] = [];
  mockedGenerate.mockImplementation(async (params) => {
    models.push(String(params.modelOverride));
    const data = params.parse({
      units: [
        {
          title: "Hukuk",
          examWeight: "high",
          topics: [
            {
              id: "t1",
              title: "Hukuk Kaynakları",
              whyLearn: "Kaynakları öğreneceksin.",
              fileIndex: 0,
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
    files: pageCounts.map((count, fileIndex) => ({
      fileName: `d${fileIndex + 1}.pdf`,
      pages: Array.from({ length: count }, (_, i) => ({
        pageNumber: i + 1,
        text: `Hukuk kaynakları yasama yürütme yargı idare sayfa ${i + 1}.`,
      })),
    })),
    allowModel: true,
  });
  expect(result.fromModel).toBe(true);
  return models;
}

describe("buildOutlineOneShot", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("uses gpt-4o-mini for short material with teacher+student fields", async () => {
    mockedGenerate.mockImplementation(async (params) => {
      expect(params.modelOverride).toBe("gpt-4o-mini");
      expect(params.callTimeoutMs).toBe(OUTLINE_CALL_TIMEOUT_MS);
      expect(params.stream).toBe(true);
      expect(params.maxTransientAttempts).toBeGreaterThanOrEqual(3);
      expect(params.idempotencyKey).toMatch(/^outline:u1:[a-z0-9]+:first$/);
      expect(params.responseFormat?.type).toBe("json_schema");
      expect(String(params.userPrompt)).toMatch(/ÖĞRETMEN|öğretmen|examWeight|likelyAsked/i);
      expect(String(params.userPrompt)).toMatch(/UYDURMA|uydurma/i);
      expect(String(params.userPrompt)).toContain("d1 = demo.pdf");
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

  it("routes on summed pages across files: 12 + 16 = 28 stays on mini", async () => {
    const models = await runSummedRouting([12, 16]);
    expect(models[0]).toBe("gpt-4o-mini");
    expect(models).toHaveLength(1);
  });

  it("routes on summed pages across files: 12 + 25 = 37 goes strong", async () => {
    const models = await runSummedRouting([12, 25]);
    expect(models[0]).toBe("gpt-4.1");
    expect(models).toHaveLength(1);
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

  it("repairs against the cited pages only, with the invalid draft attached", async () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Sayfa ${i + 1} benzersiz icerik isareti p${i + 1}q anlatilir.`,
    }));
    let repairPrompt = "";
    mockedGenerate.mockImplementation(async (params) => {
      const prompt = String(params.userPrompt ?? "");
      if (prompt.includes("geçersizdi")) {
        repairPrompt = prompt;
        return { ok: true as const, data: null, usage: { tokensIn: 1, tokensOut: 1 } } as never;
      }
      return {
        ok: true as const,
        data: params.parse({
          units: [
            {
              title: "Diğer Konular",
              topics: [{ title: "Junk", pageStart: 3, pageEnd: 4 }],
            },
          ],
        }),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [{ fileName: "kitap.pdf", pages }],
      allowModel: true,
    });

    expect(repairPrompt).toContain("[d1 s.3]");
    expect(repairPrompt).toContain("[d1 s.4]");
    expect(repairPrompt).not.toContain("[d1 s.9]");
    expect(repairPrompt).toContain('"title":"Junk"');
    expect(repairPrompt).toContain("diger_bucket");
  });

  it("asks the model to extend a previous outline and follow the book's own structure", async () => {
    let prompt = "";
    mockedGenerate.mockImplementation(async (params) => {
      prompt = String(params.userPrompt ?? "");
      return {
        ok: true as const,
        data: params.parse(groundedDraft()),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [
        {
          fileName: "demo.pdf",
          pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })),
        },
      ],
      previousOutline: [
        {
          title: "Var Olan Ünite",
          topics: [{ title: "Var Olan Konu", sourceTitles: ["Var Olan Konu"], pageNumbers: [1] }],
        },
      ],
      tocBlock: "ÜNİTE 1: Hukukun Kaynakları\nÜNİTE 2: Hak Ehliyeti",
      allowModel: true,
    });

    expect(prompt).toContain("ÖNCEKİ ÇALIŞMA YOLU");
    expect(prompt).toContain("Var Olan Konu");
    expect(prompt).toContain("Kitabın kendi yapısı");
    expect(prompt).toContain("ÜNİTE 2: Hak Ehliyeti");
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

  it("force-splits a ~1000-page corpus, runs parts in parallel, merges drafts only", async () => {
    const pageCount = ONESHOT_FORCE_SPLIT_PAGES + 1;
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      text: `Hukuk kaynakları yasama yürütme yargı idare anlatılır sayfa ${i + 1}.`,
    }));
    const keys: string[] = [];
    const mergePrompts: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      keys.push(String(params.idempotencyKey ?? ""));
      const prompt = String(params.userPrompt ?? "");
      if (prompt.includes("Kısmi taslak")) {
        mergePrompts.push(prompt);
        expect(prompt).not.toContain("--- Parça");
        expect(prompt).not.toMatch(/\[d1 s\.500\]/);
      }
      expect(params.stream).toBe(true);
      const data = params.parse(groundedDraft());
      return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [{ fileName: "kpss-1000.pdf", pages }],
      allowModel: true,
    });

    expect(result.fromModel).toBe(true);
    expect(result.path).toBe("split_merge");
    expect(result.model).toBe("gpt-4.1");
    expect(keys.some((k) => k.includes(":part"))).toBe(true);
    expect(keys.some((k) => k.endsWith(":merge") || k.includes(":merge"))).toBe(true);
    expect(mergePrompts.length).toBeGreaterThanOrEqual(1);
    expect(mockedGenerate.mock.calls.length).toBeGreaterThan(2);
  });

  it("resumes split parts from saved drafts without re-calling completed parts", async () => {
    const pageCount = ONESHOT_FORCE_SPLIT_PAGES + 1;
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      text: `Hukuk kaynakları yasama yürütme yargı idare anlatılır sayfa ${i + 1}.`,
    }));
    // Probe how many parts the splitter produces.
    const probeParts = splitFilesForOutline([{ fileName: "kpss-1000.pdf", pages }]);
    expect(probeParts.length).toBeGreaterThan(1);

    const savedParts = probeParts.map(() => groundedDraft());
    // Leave the last part empty so only it (+ merge) run.
    const resumePartDrafts = savedParts.map((d, i) =>
      i === savedParts.length - 1 ? null : d,
    );

    const keys: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      keys.push(String(params.idempotencyKey ?? ""));
      return {
        ok: true as const,
        data: params.parse(groundedDraft()),
        usage: { tokensIn: 1, tokensOut: 1 },
      } as never;
    });

    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [{ fileName: "kpss-1000.pdf", pages }],
      allowModel: true,
      resumePartDrafts,
    });

    expect(result.fromModel).toBe(true);
    expect(result.path).toBe("split_merge");
    // Only the missing last part + merge — not every part again.
    const partKeys = keys.filter((k) => k.includes(":part"));
    expect(partKeys.length).toBe(1);
    expect(keys.some((k) => k.includes(":merge"))).toBe(true);
  });

  it("falls back to OPENAI_OUTLINE_FALLBACK_MODEL when gpt-4.1 keeps failing", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      if (params.modelOverride === "gpt-4.1-mini") {
        return {
          ok: true as const,
          data: params.parse(groundedDraft()),
          usage: { tokensIn: 1, tokensOut: 1 },
        } as never;
      }
      return { ok: false as const, status: 502, error: "generation_failed" } as never;
    });

    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Hukuk kaynakları yasama yürütme yargı idare anlatılır sayfa ${i + 1}.`,
    }));
    const result = await buildOutlineOneShot({
      service: {} as never,
      userId: "u1",
      files: [{ fileName: "big.pdf", pages }],
      allowModel: true,
    });

    expect(result.fromModel).toBe(true);
    expect(result.path).toBe("fallback");
    expect(result.model).toBe("gpt-4.1-mini");
    expect(models).toContain("gpt-4.1");
    expect(models).toContain("gpt-4.1-mini");
    expect(
      mockedGenerate.mock.calls.some(
        (call) => String(call[0]?.idempotencyKey ?? "").includes(":fallback"),
      ),
    ).toBe(true);
  });
});
