import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMaterialCorpus,
  prepareOutlineMaterial,
  runOutlineStep,
  splitFilesForOutline,
  needsForceSplit,
  validateOneShotOutline,
  selectOutlineModel,
  pageTextMapFromFiles,
  pageKey,
  trimOneShotDraft,
  oneShotJsonSchema,
  oneShotOutlineSchema,
  ONESHOT_MAX_INPUT_CHARS,
  ONESHOT_FORCE_SPLIT_PAGES,
  ONESHOT_FORCE_SPLIT_CHARS,
  OUTLINE_MINI_PAGE_LIMIT,
  OUTLINE_CALL_TIMEOUT_MS,
  type OneShotOutlineDraft,
  type OutlineProgress,
  type OutlineStepResult,
} from "@/lib/documents/outline-oneshot";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_LARGE_MODEL: "gpt-4.1",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
}));

import { generateJson } from "@/lib/ai/generate";
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

describe("buildMaterialCorpus", () => {
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


type Files = { fileName: string; pages: { pageNumber: number; text: string }[] }[];

/** Drive the stage machine the way the course round does: one step per round. */
async function runToEnd(
  files: Files,
  extra: Partial<Parameters<typeof runOutlineStep>[0]> = {},
): Promise<{ result: OutlineStepResult; steps: number }> {
  const material = prepareOutlineMaterial(files);
  let progress: OutlineProgress = { stage: "first" };
  for (let steps = 1; steps <= 8; steps += 1) {
    const result = await runOutlineStep({
      service: {} as never,
      userId: "u1",
      material,
      progress,
      keyFor: (stage, part) => `outline:c1:${material.contentHash}:a${steps}:${stage}${part ? `:part${part}` : ""}`,
      deadlineAt: Date.now() + 300_000,
      ...extra,
    });
    if (result.kind !== "continue") return { result, steps };
    progress = result.progress;
  }
  throw new Error("outline did not settle");
}

function ok(data: unknown) {
  return { ok: true as const, data, usage: { tokensIn: 1, tokensOut: 1 } } as never;
}

const DEMO: Files = [
  { fileName: "demo.pdf", pages: GROUND_PAGES.map((p) => ({ pageNumber: p.pageNumber, text: p.textContent })) },
];

const JUNK = {
  units: [{ title: "Diğer Konular", topics: [{ title: "Junk", pageStart: 1, pageEnd: 1 }] }],
};

function lawPages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    pageNumber: i + 1,
    text: `Hukuk kaynakları yasama yürütme yargı idare anlatılır sayfa ${i + 1}.`,
  }));
}

async function runSummedRouting(pageCounts: number[]): Promise<string[]> {
  const models: string[] = [];
  mockedGenerate.mockImplementation(async (params) => {
    models.push(String(params.modelOverride));
    return ok(params.parse(groundedDraft({ title: "Hukuk Kaynakları", pageEnd: 3 })));
  });
  const { result } = await runToEnd(
    pageCounts.map((count, i) => ({ fileName: `d${i + 1}.pdf`, pages: lawPages(count) })),
  );
  expect(result.kind).toBe("done");
  return models;
}

describe("runOutlineStep (one course outline)", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("uses gpt-4o-mini for short material with teacher+student fields", async () => {
    mockedGenerate.mockImplementation(async (params) => {
      expect(params.modelOverride).toBe("gpt-4o-mini");
      expect(params.callTimeoutMs).toBe(OUTLINE_CALL_TIMEOUT_MS);
      expect(params.stream).toBe(true);
      expect(params.deferCommit).toBe(true);
      expect(params.idempotencyKey).toMatch(/^outline:c1:[a-z0-9]+:a1:first$/);
      expect(params.responseFormat?.type).toBe("json_schema");
      expect(String(params.userPrompt)).toMatch(/ÖĞRETMEN|examWeight|likelyAsked/i);
      expect(String(params.userPrompt)).toMatch(/UYDURMA/i);
      expect(String(params.userPrompt)).toContain("d1 = demo.pdf");
      const draft = groundedDraft();
      draft.units[0]!.topics.push({
        id: "t2",
        title: "Hak Ehliyeti",
        whyLearn: "Hak ehliyeti ile fiil ehliyetini ayıracaksın.",
        pageStart: 2,
        pageEnd: 2,
        examWeight: "medium",
        likelyAsked: ["Hak ehliyeti"],
        prerequisiteIds: ["t1"],
        fileIndex: 0,
      } as never);
      return { ok: true, data: params.parse(draft), reservationId: "r-first" } as never;
    });
    const { result, steps } = await runToEnd(DEMO, { examLabel: "KPSS" });
    expect(steps).toBe(1);
    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(result.path).toBe("first");
    expect(result.map.model).toBe("gpt-4o-mini");
    expect(result.map.reservationIds).toEqual(["r-first"]);
    const topics = result.map.units[0]!.topics;
    expect(result.map.units[0]!.examWeight).toBe("high");
    expect(topics[0]!.likelyAsked).toEqual(["Yazılı kaynaklar", "Örf ve âdet"]);
    expect(topics[1]!.prerequisiteTitles).toContain("Hukukun Kaynakları");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("routes >30 page material to gpt-4.1 in one call (no split)", async () => {
    const models = await runSummedRouting([40]);
    expect(models).toEqual(["gpt-4.1"]);
  });

  it("routes on summed pages across files: 12 + 16 = 28 stays on mini", async () => {
    expect(await runSummedRouting([12, 16])).toEqual(["gpt-4o-mini"]);
  });

  it("routes on summed pages across files: 16 + 16 = 32 goes strong", async () => {
    expect(await runSummedRouting([16, 16])).toEqual(["gpt-4.1"]);
  });

  it("escalates to gpt-4.1 when the mini draft is rejected, releasing the mini draft", async () => {
    const models: string[] = [];
    let release: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      if (models.length === 1) return { ok: true, data: params.parse(JUNK), reservationId: "r-mini" } as never;
      return { ok: true, data: params.parse(groundedDraft()), reservationId: "r-strong" } as never;
    });
    const material = prepareOutlineMaterial(DEMO);
    const keyFor = (stage: string) => `k:${stage}`;
    const first = await runOutlineStep({
      service: {} as never, userId: "u1", material, progress: { stage: "first" }, keyFor, deadlineAt: Date.now() + 300_000,
    });
    expect(first.kind).toBe("continue");
    if (first.kind === "continue") {
      release = first.release;
      expect(first.progress.stage).toBe("escalate");
      const second = await runOutlineStep({
        service: {} as never, userId: "u1", material, progress: first.progress, keyFor, deadlineAt: Date.now() + 300_000,
      });
      expect(second.kind).toBe("done");
      if (second.kind === "done") {
        expect(second.path).toBe("escalate");
        expect(second.map.reservationIds).toEqual(["r-strong"]);
      }
    }
    expect(release).toEqual(["r-mini"]);
    expect(models).toEqual(["gpt-4o-mini", "gpt-4.1"]);
  });

  it("runs one repair on the strong model after escalation still fails", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      if (String(params.userPrompt).includes("geçersizdi")) return ok(params.parse(groundedDraft()));
      return ok(params.parse(JUNK));
    });
    const { result } = await runToEnd(DEMO);
    expect(result.kind).toBe("done");
    if (result.kind === "done") expect(result.path).toBe("repair");
    expect(models).toEqual(["gpt-4o-mini", "gpt-4.1", "gpt-4.1"]);
  });

  it("repairs against the cited pages only, with the invalid draft attached", async () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Sayfa ${i + 1} benzersiz icerik isareti p${i + 1}q anlatilir.`,
    }));
    let repairPrompt = "";
    mockedGenerate.mockImplementation(async (params) => {
      const prompt = String(params.userPrompt ?? "");
      if (prompt.includes("geçersizdi")) {
        repairPrompt = prompt;
        return ok(null);
      }
      return ok(params.parse({ units: [{ title: "Diğer Konular", topics: [{ title: "Junk", pageStart: 3, pageEnd: 4 }] }] }));
    });
    const { result } = await runToEnd([{ fileName: "kitap.pdf", pages }]);
    expect(result.kind).toBe("exhausted");
    expect(repairPrompt).toContain("[d1 s.3]");
    expect(repairPrompt).toContain("[d1 s.4]");
    expect(repairPrompt).not.toContain("[d1 s.9]");
    expect(repairPrompt).toContain('"title":"Junk"');
    expect(repairPrompt).toContain("diger_bucket");
  });

  it("add-source: one call that carries the previous outline and the book's structure", async () => {
    let prompt = "";
    mockedGenerate.mockImplementation(async (params) => {
      prompt = String(params.userPrompt ?? "");
      return ok(params.parse(groundedDraft()));
    });
    const { steps } = await runToEnd(DEMO, {
      previousOutline: [
        { title: "Var Olan Ünite", topics: [{ title: "Var Olan Konu", sourceTitles: ["Var Olan Konu"], pageNumbers: [1] }] },
      ],
      tocBlock: "ÜNİTE 1: Hukukun Kaynakları\nÜNİTE 2: Hak Ehliyeti",
    });
    expect(steps).toBe(1);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(prompt).toContain("Var Olan Konu");
    expect(prompt).toContain("Kitabın kendi yapısı");
    expect(prompt).toContain("ÜNİTE 2: Hak Ehliyeti");
  });

  it("ends exhausted (no fake list) when every model fails", async () => {
    mockedGenerate.mockRejectedValue(new Error("network"));
    const { result } = await runToEnd(DEMO);
    expect(result.kind).toBe("exhausted");
  });

  it("rejects fabricated page numbers without inventing a fallback map", async () => {
    mockedGenerate.mockImplementation(async (params) =>
      ok(params.parse({ units: [{ title: "Unit", topics: [{ title: "Invented", whyLearn: "yok", pageStart: 1, pageEnd: 999 }] }] })),
    );
    const { result } = await runToEnd([{ fileName: "demo.pdf", pages: [{ pageNumber: 1, text: "Kısa metin hukuk kaynakları." }] }]);
    expect(result.kind).toBe("exhausted");
  });

  it("stops before a call that cannot finish in the round (wait, no call)", async () => {
    const material = prepareOutlineMaterial(DEMO);
    const result = await runOutlineStep({
      service: {} as never, userId: "u1", material, progress: { stage: "first" },
      keyFor: () => "k", deadlineAt: Date.now() + 5_000,
    });
    expect(result.kind).toBe("wait");
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("keeps the stage on our own deadline abort (no model switch)", async () => {
    mockedGenerate.mockResolvedValue({ ok: false, status: 504, error: "deadline" } as never);
    const material = prepareOutlineMaterial(DEMO);
    const result = await runOutlineStep({
      service: {} as never, userId: "u1", material, progress: { stage: "first" },
      keyFor: () => "k", deadlineAt: Date.now() + 300_000,
    });
    expect(result.kind).toBe("continue");
    if (result.kind === "continue") {
      expect(result.progress.stage).toBe("first");
      expect(result.failed).toBe(true);
    }
  });

  it("force-splits a huge course with global file labels and merges part drafts only", async () => {
    const files: Files = [
      { fileName: "a.pdf", pages: lawPages(600) },
      { fileName: "b.pdf", pages: lawPages(600) },
    ];
    const keys: string[] = [];
    const partPrompts: string[] = [];
    let mergePrompt = "";
    mockedGenerate.mockImplementation(async (params) => {
      keys.push(String(params.idempotencyKey ?? ""));
      const prompt = String(params.userPrompt ?? "");
      if (prompt.includes("Kısmi taslak")) {
        mergePrompt = prompt;
        return ok(params.parse(groundedDraft({ title: "Hukuk Kaynakları", fileIndex: 1, pageStart: 10, pageEnd: 12 })));
      }
      partPrompts.push(prompt);
      return ok(params.parse(groundedDraft({ title: "Hukuk Kaynakları", pageEnd: 3 })));
    });
    const { result } = await runToEnd(files);
    expect(result.kind).toBe("done");
    if (result.kind !== "done") return;
    expect(result.path).toBe("merge");
    expect(keys.some((k) => k.includes(":part"))).toBe(true);
    expect(keys.some((k) => k.endsWith(":merge"))).toBe(true);
    // A part holding only the second file still labels its pages d2.
    expect(partPrompts.some((p) => /\[d2 s\.\d+\] Hukuk/.test(p) && !/\[d1 s\.\d+\] Hukuk/.test(p))).toBe(true);
    expect(mergePrompt).not.toMatch(/\[d1 s\.500\]/);
    expect(result.map.units[0]!.topics[0]!.fileIndex).toBe(1);
  });

  it("resumes split parts from saved drafts without re-calling completed parts", async () => {
    const files: Files = [{ fileName: "kpss-1000.pdf", pages: lawPages(ONESHOT_FORCE_SPLIT_PAGES + 1) }];
    const material = prepareOutlineMaterial(files);
    expect(material.parts?.length ?? 0).toBeGreaterThan(1);
    const parts = material.parts!.map((_, i, all) =>
      i === all.length - 1 ? null : { draft: groundedDraft() as OneShotOutlineDraft },
    );
    const keys: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      keys.push(String(params.idempotencyKey ?? ""));
      return ok(params.parse(groundedDraft()));
    });
    const result = await runOutlineStep({
      service: {} as never, userId: "u1", material, progress: { stage: "first", parts },
      keyFor: (stage, part) => `${stage}${part ? `:part${part}` : ""}`, deadlineAt: Date.now() + 300_000,
    });
    expect(result.kind).toBe("continue");
    if (result.kind === "continue") expect(result.progress.stage).toBe("merge");
    expect(keys).toEqual([`first:part${parts.length}`]);
  });

  it("falls back to OPENAI_OUTLINE_FALLBACK_MODEL when gpt-4.1 fails at provider level", async () => {
    const models: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      models.push(String(params.modelOverride));
      if (params.modelOverride === "gpt-4.1-mini") return ok(params.parse(groundedDraft({ title: "Hukuk Kaynakları", pageEnd: 3 })));
      return { ok: false as const, status: 502, error: "generation_failed" } as never;
    });
    const { result } = await runToEnd([{ fileName: "big.pdf", pages: lawPages(40) }]);
    expect(result.kind).toBe("done");
    if (result.kind === "done") {
      expect(result.path).toBe("fallback");
      expect(result.map.model).toBe("gpt-4.1-mini");
    }
    expect(models).toEqual(["gpt-4.1", "gpt-4.1-mini"]);
  });
});
