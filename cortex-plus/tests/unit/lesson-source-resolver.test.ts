import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzePage, pageUsableForLesson } from "@/lib/documents/page-analysis";
import { topicTitlesAlign } from "@/lib/learning/lesson-teach";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";
import { MIN_USABLE_LESSON_CHARS } from "@/lib/learning/source-context";

vi.mock("server-only", () => ({}));

const loadPageSourceContext = vi.fn();
const loadTopicSpanContext = vi.fn();
const searchDocumentChunksAcross = vi.fn();

vi.mock("@/lib/learning/source-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/source-context")>(
    "@/lib/learning/source-context",
  );
  return {
    ...actual,
    loadPageSourceContext: (...args: unknown[]) => loadPageSourceContext(...args),
    loadTopicSpanContext: (...args: unknown[]) => loadTopicSpanContext(...args),
  };
});

vi.mock("@/lib/rag/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag/pipeline")>(
    "@/lib/rag/pipeline",
  );
  return {
    ...actual,
    searchDocumentChunksAcross: (...args: unknown[]) =>
      searchDocumentChunksAcross(...args),
  };
});

import { resolveLessonSource } from "@/lib/learning/lesson-source-resolver";

function pageBlock(doc: string, pages: number[], text: string) {
  return {
    matches: [],
    documentName: doc,
    formulas: [] as string[],
    skippedPages: [] as number[],
    usableChars: text.length,
    block:
      `\n\nÖğrencinin kendi kaynağından bu konunun sayfaları:\n` +
      pages.map((page) => `[s.${page}] ${doc}: ${text}`).join("\n\n"),
  };
}

function mockService(handlers: Record<string, (args: unknown) => unknown> = {}) {
  const from = vi.fn((table: string) => {
    const state: Record<string, unknown> = { table };
    const api: Record<string, unknown> = {};
    const chain = () => api;
    for (const method of [
      "select",
      "eq",
      "in",
      "is",
      "not",
      "contains",
      "limit",
      "order",
      "update",
    ]) {
      api[method] = vi.fn((...args: unknown[]) => {
        state[method] = args;
        return api;
      });
    }
    api.maybeSingle = vi.fn(async () => {
      const key = `${table}:maybeSingle`;
      if (handlers[key]) return handlers[key](state);
      return { data: null, error: null };
    });
    api.then = undefined;
    // terminal for update
    api.eq = vi.fn((...args: unknown[]) => {
      state.eq = [...((state.eq as unknown[]) ?? []), ...args];
      return {
        ...api,
        then: undefined,
        eq: api.eq,
      };
    });
    // Make awaitable update
    Object.assign(api, {
      then: undefined,
    });
    // For update().eq().eq() pattern — return promise-like via final eq
    const originalUpdate = api.update as ReturnType<typeof vi.fn>;
    api.update = vi.fn((payload: unknown) => {
      state.update = payload;
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(async () => {
            const key = `${table}:update`;
            if (handlers[key]) return handlers[key]({ ...state, payload });
            return { data: null, error: null };
          }),
        })),
      };
    });
    void originalUpdate;
    return api;
  });
  return { from } as never;
}

describe("pageUsableForLesson — harita ve okuyucu aynı kural", () => {
  it("kısa slayt (unreadable, metin dolu) derste kullanılabilir", () => {
    const slide = analyzePage(2, "Mol oranı denklemi");
    expect(slide.pageKind).toBe("unreadable");
    expect(slide.extractionOk).toBe(false);
    expect(pageUsableForLesson(slide)).toBe(true);
    // pagesForTopicMap aynı pageUsableForLesson kuralını kullanır (kısa slayt yolu).
    expect(
      [slide].filter(
        (page) =>
          page.pageKind !== "content" &&
          page.pageKind !== "uncertain" &&
          pageUsableForLesson(page),
      ),
    ).toHaveLength(1);
  });

  it("boş OCR / kapak / cevap anahtarı kullanılmaz", () => {
    expect(pageUsableForLesson(analyzePage(1, ""))).toBe(false);
    expect(pageUsableForLesson(analyzePage(1, "Kapak\nYazar Adı\nISBN 123"))).toBe(false);
  });
});

describe("topicTitlesAlign — kök örtüşmesi", () => {
  it("kimya dışı üç konuda hizalar (özel yama yok)", () => {
    expect(topicTitlesAlign("Düzgün doğrusal hareket", "Doğrusal hareket ve hız")).toBe(true);
    expect(topicTitlesAlign("Türev kuralları", "Türev alma kuralları")).toBe(true);
    expect(topicTitlesAlign("Fransız İhtilali sonuçları", "Fransız İhtilali")).toBe(true);
  });
});

describe("parseTopicSourceRefs", () => {
  it("belge başına sayfa tutar — karışmaz", () => {
    const refs = parseTopicSourceRefs([
      { documentId: "doc-a", pages: [1, 2], nodeId: "n1", fileName: "a.pdf" },
      { documentId: "doc-b", pages: [4], nodeId: "n2", fileName: "b.pptx" },
    ]);
    expect(refs).toHaveLength(2);
    expect(refs[0].pages).toEqual([1, 2]);
    expect(refs[1].pages).toEqual([4]);
  });
});

describe("resolveLessonSource", () => {
  beforeEach(() => {
    loadPageSourceContext.mockReset();
    loadTopicSpanContext.mockReset();
    searchDocumentChunksAcross.mockReset();
  });

  it("keeps a single document's sparse-page signal through source_refs", async () => {
    loadPageSourceContext.mockResolvedValue({
      ...pageBlock("trigonometri.pdf", [10, 11, 12], "Yatay koordinat kosinüs, düşey koordinat sinüstür."),
      repetitiveSparseEvidence: true,
    });
    const result = await resolveLessonSource(mockService(), {
      userId: "student",
      prepId: "prep",
      topicId: "topic",
      topicLabel: "Birim Çember",
      sessionMeta: { sourcePages: [10, 11, 12] },
      prepDocs: ["document"],
      primaryDocumentId: "document",
      topicDocumentId: "document",
      topicNodeId: "node",
      sourceRefs: [{ documentId: "document", pages: [10, 11, 12], nodeId: "node" }],
      sourceDocumentIds: ["document"],
      sourceBoundaryMode: "documents_only",
    });
    expect(result.unavailable).toBeUndefined();
    expect(result.context?.repetitiveSparseEvidence).toBe(true);
  });

  it("1) çok dosyalı source_refs: her belge kendi sayfasını okur", async () => {
    loadPageSourceContext.mockImplementation(
      async (_s, _u, documentId: string, pages: number[]) => {
        if (documentId === "doc-a") {
          return pageBlock("a.pdf", pages, "Stokiyometri mol hesabı ve oranlar. ".repeat(8));
        }
        if (documentId === "doc-b") {
          return pageBlock("b.pptx", pages, "Tepkime denklemi dengeleme adımları. ".repeat(8));
        }
        return pageBlock("x", pages, "");
      },
    );
    const service = mockService({
      "exam_prep_topics:maybeSingle": () => ({
        data: {
          source_refs: [],
          document_topic_node_id: null,
          exam_prep_id: "prep-1",
        },
        error: null,
      }),
    });

    const result = await resolveLessonSource(service, {
      userId: "user-1",
      prepId: "prep-1",
      topicId: "topic-1",
      topicLabel: "Stokiyometri",
      sessionMeta: { sourcePages: [] },
      prepDocs: ["doc-a", "doc-b"],
      primaryDocumentId: "doc-a",
      topicDocumentId: null,
      topicNodeId: null,
      sourceRefs: [
        { documentId: "doc-a", pages: [2, 3], nodeId: "n-a", fileName: "a.pdf" },
        { documentId: "doc-b", pages: [1], nodeId: "n-b", fileName: "b.pptx" },
      ],
      sourceDocumentIds: ["doc-a", "doc-b"],
      sourceBoundaryMode: "documents_only",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.context?.block).toContain("[s.2]");
    expect(result.context?.block).toContain("[s.1]");
    expect(loadPageSourceContext).toHaveBeenCalledWith(
      service,
      "user-1",
      "doc-a",
      [2, 3],
      expect.objectContaining({ mode: "tolerant" }),
    );
    expect(loadPageSourceContext).toHaveBeenCalledWith(
      service,
      "user-1",
      "doc-b",
      [1],
      expect.objectContaining({ mode: "tolerant" }),
    );
    // Sayfa numaraları belgeler arasında karışmaz
    const calls = loadPageSourceContext.mock.calls;
    expect(calls.find((call) => call[2] === "doc-a")?.[3]).toEqual([2, 3]);
    expect(calls.find((call) => call[2] === "doc-b")?.[3]).toEqual([1]);
  });

  it("2) A2 regresyon: title_align dolu iken arama fırlasa kaynak kalır", async () => {
    loadPageSourceContext.mockResolvedValue(pageBlock("x", [], ""));
    loadTopicSpanContext.mockResolvedValue({
      matches: [],
      documentName: "fizik.pdf",
      formulas: [],
      block: "Hareket ve ivme tanımları. ".repeat(20),
    });
    searchDocumentChunksAcross.mockRejectedValue(new Error("boom"));

    const service = mockService({
      "exam_prep_topics:maybeSingle": () => ({
        data: { source_refs: [], document_topic_node_id: null, exam_prep_id: "prep-1" },
        error: null,
      }),
      "exam_prep_topics:update": () => ({ data: null, error: null }),
    });

    const result = await resolveLessonSource(service, {
      userId: "user-1",
      prepId: "prep-1",
      topicId: "topic-1",
      topicLabel: "Düzgün doğrusal hareket",
      sessionMeta: { sourcePages: [] },
      prepDocs: ["doc-p"],
      primaryDocumentId: "doc-p",
      topicDocumentId: "doc-p",
      topicNodeId: null,
      sourceRefs: [],
      sourceDocumentIds: ["doc-p"],
      sourceBoundaryMode: "documents_only",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.context?.block).toContain("Hareket ve ivme");
    expect(result.trace.steps.some((step) => step.step === "title_align" && step.ok)).toBe(
      true,
    );
  });

  it("3) tolerant: kısa slayt atlanır, belge reddedilmez", async () => {
    loadPageSourceContext.mockResolvedValue({
      ...pageBlock("slayt.pptx", [2], "İçerik sayfası metni yeterince uzun. ".repeat(10)),
      skippedPages: [1],
      usableChars: 400,
    });
    const service = mockService({
      "exam_prep_topics:maybeSingle": () => ({
        data: { source_refs: [], document_topic_node_id: null, exam_prep_id: "prep-1" },
        error: null,
      }),
    });

    const result = await resolveLessonSource(service, {
      userId: "user-1",
      prepId: "prep-1",
      topicId: "topic-1",
      topicLabel: "Asit baz",
      sessionMeta: { sourcePages: [] },
      prepDocs: ["doc-s"],
      primaryDocumentId: "doc-s",
      topicDocumentId: "doc-s",
      topicNodeId: null,
      sourceRefs: [
        { documentId: "doc-s", pages: [1, 2], nodeId: "n1", fileName: "slayt.pptx" },
      ],
      sourceDocumentIds: ["doc-s"],
      sourceBoundaryMode: "documents_only",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.trace.steps[0]?.skippedPages).toEqual([1]);
    expect(result.context?.block.length).toBeGreaterThanOrEqual(MIN_USABLE_LESSON_CHARS);
  });

  it("5) eski hazırlık: source_refs yok → arama bulur ama fuzzy yazmaz", async () => {
    loadPageSourceContext.mockResolvedValue(pageBlock("x", [], ""));
    loadTopicSpanContext.mockResolvedValue(null);
    searchDocumentChunksAcross.mockResolvedValue([
      {
        chunkId: "c1",
        documentId: "doc-old",
        content: "Türev tanımı ve limit. ".repeat(12),
        documentName: "mat.pdf",
        similarity: 0.7,
        pageNumber: 5,
        chunkIndex: 0,
      },
    ]);
    let updateCount = 0;
    const service = {
      from: vi.fn((table: string) => {
        if (table === "documents") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  is: async () => ({
                    data: [{ id: "doc-old", status: "completed" }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "exam_prep_topics") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    source_refs: [],
                    document_topic_node_id: null,
                    exam_prep_id: "prep-old",
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => {
                  updateCount += 1;
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }),
    } as never;

    const first = await resolveLessonSource(service, {
      userId: "user-1",
      prepId: "prep-old",
      topicId: "topic-old",
      topicLabel: "Türev",
      sessionMeta: { sourcePages: [] },
      prepDocs: ["doc-old"],
      primaryDocumentId: "doc-old",
      topicDocumentId: null,
      topicNodeId: null,
      sourceRefs: [],
      sourceDocumentIds: ["doc-old"],
      sourceBoundaryMode: "documents_only",
    });
    expect(first.unavailable).toBeUndefined();
    expect(first.context?.block).toContain("Türev");
    // Fuzzy arama kalıcı source_refs yazmaz.
    expect(updateCount).toBe(0);
    expect(first.trace.healed).toBeFalsy();
  });

  it("5b) iki belgelik title_align heal: sayfalar kendi documentId altına yazılır", async () => {
    loadPageSourceContext.mockResolvedValue(pageBlock("x", [], ""));
    loadTopicSpanContext.mockResolvedValue({
      matches: [],
      documentName: "kitap-a.pdf",
      formulas: [],
      block:
        "[s.2] kitap-a: Mol oranı. ".repeat(8) +
        "\n\n[s.9] kitap-b: Gaz hacmi. ".repeat(8),
      pagesByDocument: [
        { documentId: "doc-a", pages: [2, 3] },
        { documentId: "doc-b", pages: [9] },
      ],
    });
    searchDocumentChunksAcross.mockResolvedValue([]);
    let writtenRefs: unknown = null;
    const service = {
      from: vi.fn((table: string) => {
        if (table === "exam_prep_topics") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    source_refs: [],
                    document_topic_node_id: null,
                    exam_prep_id: "prep-2",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: { source_refs?: unknown }) => ({
              eq: () => ({
                eq: async () => {
                  writtenRefs = payload.source_refs;
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }),
    } as never;

    const result = await resolveLessonSource(service, {
      userId: "user-1",
      prepId: "prep-2",
      topicId: "topic-2",
      topicLabel: "Mol oranı",
      sessionMeta: null,
      prepDocs: ["doc-a", "doc-b"],
      primaryDocumentId: "doc-a",
      topicDocumentId: null,
      topicNodeId: null,
      sourceRefs: [],
      sourceDocumentIds: ["doc-a", "doc-b"],
      sourceBoundaryMode: "documents_only",
    });
    expect(result.unavailable).toBeUndefined();
    expect(result.trace.healed).toBe(true);
    expect(Array.isArray(writtenRefs)).toBe(true);
    const refs = writtenRefs as { documentId: string; pages: number[] }[];
    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentId: "doc-a", pages: [2, 3] }),
        expect.objectContaining({ documentId: "doc-b", pages: [9] }),
      ]),
    );
    // Tek belge altına karışık sayfa yazılmamalı.
    expect(refs.some((ref) => ref.documentId === "doc-a" && ref.pages.includes(9))).toBe(
      false,
    );
  });

  it("6) sarkık nodeId → kendini onarır", async () => {
    loadPageSourceContext.mockResolvedValue(
      pageBlock("hist.pdf", [3], "Fransız İhtilali toplumsal sonuçları. ".repeat(10)),
    );
    let healedNode: string | null = null;
    const service = {
      from: vi.fn((table: string) => {
        if (table === "document_topic_nodes") {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => {
                  if (id === "stale-node") return { data: null, error: null };
                  if (id === "fresh-node") {
                    return {
                      data: { id: "fresh-node", document_id: "doc-h", title: "Fransız İhtilali" },
                      error: null,
                    };
                  }
                  return {
                    data: {
                      id: "fresh-node",
                      title: "Fransız İhtilali sonuçları",
                    },
                    error: null,
                  };
                },
                // list nodes for findReplacementNode
              }),
            }),
          };
        }
        // Override for .select().eq("document_id") list
        if (table === "document_topic_nodes") {
          /* handled above */
        }
        if (table === "exam_prep_topics") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    source_refs: [
                      {
                        documentId: "doc-h",
                        pages: [3],
                        nodeId: healedNode ?? "stale-node",
                        fileName: "hist.pdf",
                      },
                    ],
                    document_topic_node_id: healedNode ?? "stale-node",
                    exam_prep_id: "prep-h",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: { document_topic_node_id?: string; source_refs?: unknown }) => ({
              eq: () => ({
                eq: async () => {
                  if (payload.document_topic_node_id) {
                    healedNode = payload.document_topic_node_id;
                  }
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              in: async () => ({ data: [], error: null }),
            }),
            in: () => ({
              // nodes list for replacement
              then: undefined,
            }),
          }),
        };
      }),
    } as never;

    // Simpler dedicated mock for heal path
    const nodesByDoc = [
      { id: "fresh-node", title: "Fransız İhtilali sonuçları" },
    ];
    const service2 = {
      from: (table: string) => {
        if (table === "document_topic_nodes") {
          return {
            select: () => ({
              eq: (col: string, val: string) => {
                if (col === "id") {
                  return {
                    maybeSingle: async () => {
                      if (val === "stale-node") return { data: null, error: null };
                      return {
                        data: { id: val, document_id: "doc-h", title: "Fransız İhtilali" },
                        error: null,
                      };
                    },
                  };
                }
                if (col === "document_id") {
                  return {
                    then: undefined,
                    // awaitable via implicit - use array return for select chain end
                    // vitest: make it thenable
                    [Symbol.asyncIterator]: undefined,
                  };
                }
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
              // for findReplacementNode: .select().eq("document_id", id)
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    };

    // Use a fully controlled heal scenario via source_refs load success + stale node check
    loadPageSourceContext.mockResolvedValue(
      pageBlock("hist.pdf", [3], "Fransız İhtilali toplumsal sonuçları. ".repeat(10)),
    );

    let updatePayload: Record<string, unknown> | null = null;
    const healService = {
      from: (table: string) => {
        if (table === "document_topic_nodes") {
          const builder: Record<string, unknown> = {};
          builder.select = () => builder;
          builder.eq = (col: string, val: string) => {
            if (col === "id") {
              return {
                maybeSingle: async () =>
                  val === "stale-node"
                    ? { data: null, error: null }
                    : {
                        data: {
                          id: "fresh-node",
                          document_id: "doc-h",
                          title: "Fransız İhtilali",
                        },
                        error: null,
                      },
              };
            }
            if (col === "document_id") {
              return Promise.resolve({ data: nodesByDoc, error: null });
            }
            return Promise.resolve({ data: nodesByDoc, error: null });
          };
          return builder;
        }
        if (table === "document_topic_page_links") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ topic_id: "fresh-node", page_number: 3 }],
                error: null,
              }),
            }),
          };
        }
        if (table === "exam_prep_topics") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    source_refs: [
                      {
                        documentId: "doc-h",
                        pages: [3],
                        nodeId: "stale-node",
                        fileName: "hist.pdf",
                      },
                    ],
                    document_topic_node_id: "stale-node",
                    exam_prep_id: "prep-h",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: () => ({
                eq: async () => {
                  updatePayload = payload;
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      },
    } as never;

    void service;
    void service2;

    const result = await resolveLessonSource(healService, {
      userId: "user-1",
      prepId: "prep-h",
      topicId: "topic-h",
      topicLabel: "Fransız İhtilali",
      sessionMeta: { sourcePages: [] },
      prepDocs: ["doc-h"],
      primaryDocumentId: "doc-h",
      topicDocumentId: "doc-h",
      topicNodeId: "stale-node",
      sourceRefs: [
        {
          documentId: "doc-h",
          pages: [3],
          nodeId: "stale-node",
          fileName: "hist.pdf",
        },
      ],
      sourceDocumentIds: ["doc-h"],
      sourceBoundaryMode: "documents_only",
    });

    expect(result.unavailable).toBeUndefined();
    expect(result.trace.healed).toBe(true);
    expect(updatePayload).toBeTruthy();
    const refs = (updatePayload as { source_refs?: { nodeId?: string }[] } | null)
      ?.source_refs;
    expect(refs?.[0]?.nodeId).toBe("fresh-node");
  });

  it("8) fizik / matematik / tarih — konuya özel kod yok", async () => {
    for (const topic of [
      "Düzgün doğrusal hareket",
      "Türev alma",
      "Fransız İhtilali",
    ]) {
      loadPageSourceContext.mockResolvedValue(
        pageBlock("gen.pdf", [1], `${topic} anlatım metni. `.repeat(15)),
      );
      const service = mockService();
      const result = await resolveLessonSource(service, {
        userId: "u",
        prepId: "p",
        topicId: "t",
        topicLabel: topic,
        sessionMeta: { sourcePages: [] },
        prepDocs: ["d1"],
        primaryDocumentId: "d1",
        topicDocumentId: "d1",
        topicNodeId: null,
        sourceRefs: [{ documentId: "d1", pages: [1], nodeId: null, fileName: "gen.pdf" }],
        sourceDocumentIds: ["d1"],
        sourceBoundaryMode: "documents_only",
      });
      expect(result.unavailable).toBeUndefined();
      expect(result.context?.block).toContain(topic.split(" ")[0]!);
    }
  });
});
