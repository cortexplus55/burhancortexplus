import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadExcludedSiblingTopics, nodeIdsFromSourceRefs, pagelessDocumentIds } from "@/lib/learning/sibling-topics";

/** Tablo adına göre sabit satır döndüren küçük sahte istemci; zincirdeki filtreler yok sayılır. */
function fakeService(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "in", "limit"]) chain[name] = () => chain;
      chain.then = (resolve: (value: typeof result) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as SupabaseClient;
}

const DOC = "00000000-0000-4000-8000-000000000001";

describe("FAZ 1-A §1 — kardeş ünitenin sayfası boş kaynaktan çözülür", () => {
  it("source_refs içindeki nodeId ve sayfasız belge okunur", () => {
    const refs = [{ documentId: DOC, nodeId: "n2", pages: [] }];
    expect(nodeIdsFromSourceRefs(refs)).toEqual(["n2"]);
    expect(pagelessDocumentIds(refs)).toEqual([DOC]);
    expect(pagelessDocumentIds([{ documentId: DOC, pages: [1] }])).toEqual([]);
  });

  it("sayfa bağı source_refs'teki düğümden gelir", async () => {
    const service = fakeService({
      exam_prep_topics: [
        { id: "t1", label: "Ünite 1", source_refs: [{ documentId: DOC, pages: [1] }], document_topic_node_id: null },
        { id: "t2", label: "Ünite 2", source_refs: [{ documentId: DOC, nodeId: "n2", pages: [] }], document_topic_node_id: null },
      ],
      document_topic_page_links: [{ topic_id: "n2", document_id: DOC, page_number: 1 }],
      documents: [],
    });
    await expect(loadExcludedSiblingTopics(service, { prepId: "p", topicLabel: "Ünite 1", topicId: "t1" })).resolves.toEqual([
      "Ünite 2",
    ]);
  });

  it("tek sayfalık belgede sayfasız ünite o sayfadadır", async () => {
    const service = fakeService({
      exam_prep_topics: [
        { id: "t1", label: "Ünite 1", source_refs: [{ documentId: DOC, pages: [1] }], document_topic_node_id: null },
        { id: "t2", label: "Ünite 2", source_refs: [{ documentId: DOC, pages: [] }], document_topic_node_id: null },
      ],
      document_topic_page_links: [],
      documents: [{ id: DOC, page_count: 1 }],
    });
    await expect(loadExcludedSiblingTopics(service, { prepId: "p", topicLabel: "Ünite 1", topicId: "t1" })).resolves.toEqual([
      "Ünite 2",
    ]);
  });

  it("çok sayfalık belgede sayfasız ünite kardeş sayılmaz", async () => {
    const service = fakeService({
      exam_prep_topics: [
        { id: "t1", label: "Ünite 1", source_refs: [{ documentId: DOC, pages: [1] }], document_topic_node_id: null },
        { id: "t2", label: "Ünite 2", source_refs: [{ documentId: DOC, pages: [] }], document_topic_node_id: null },
      ],
      document_topic_page_links: [],
      documents: [{ id: DOC, page_count: 12 }],
    });
    await expect(loadExcludedSiblingTopics(service, { prepId: "p", topicLabel: "Ünite 1", topicId: "t1" })).resolves.toEqual([]);
  });
});
