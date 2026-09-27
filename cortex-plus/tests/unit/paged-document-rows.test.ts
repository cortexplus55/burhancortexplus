import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";
import { groundPrepTopics } from "@/lib/learning/ground-prep-topics";

describe("loadPagedDocumentRows", () => {
  it("reads beyond PostgREST's first thousand rows without losing the last page", async () => {
    const rows = Array.from({ length: 1_099 }, (_, index) => ({
      document_id: "doc-a",
      page_number: index + 1,
    }));
    const ranges: number[][] = [];
    const query = {
      select: () => query,
      in: () => query,
      order: () => query,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
    const service = { from: () => query } as unknown as SupabaseClient;
    const loaded = await loadPagedDocumentRows(
      service,
      "document_pages",
      "document_id, page_number",
      ["doc-a"],
      ["page_number"],
    );
    expect(loaded).toHaveLength(1_099);
    expect(loaded.at(-1)?.page_number).toBe(1_099);
    expect(ranges).toHaveLength(6);
  });

  it("fails a partial read instead of presenting incomplete coverage", async () => {
    const query = {
      select: () => query,
      in: () => query,
      order: () => query,
      range: async () => ({ data: null, error: { message: "database unavailable" } }),
    };
    const service = { from: () => query } as unknown as SupabaseClient;
    await expect(loadPagedDocumentRows(service, "document_pages", "page_number", ["doc-a"], ["page_number"]))
      .rejects.toThrow("document_rows_unavailable:document_pages");
  });
});

describe("long-document topic grounding", () => {
  it("grounds a new study topic found only on the 99th physical page", async () => {
    const pages = Array.from({ length: 99 }, (_, index) => ({
      document_id: "doc-a",
      page_number: index + 1,
      text_content: index === 98 ? "Nefronların süzme işlevi burada anlatılır." : "Başka konu",
      headings: [],
    }));
    const service = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          in: () => query,
          order: () => query,
          range: async (from: number, to: number) => ({
            data: table === "document_pages" ? pages.slice(from, to + 1) : [],
            error: null,
          }),
          then: (resolve: (result: unknown) => unknown) => Promise.resolve({
            data: table === "documents"
              ? [{ id: "doc-a", file_name: "uzun.pdf" }]
              : [],
            error: null,
          }).then(resolve),
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const result = await groundPrepTopics(service, "student-a", ["doc-a"], ["Nefronların süzme işlevi"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches[0]?.pageNumbers).toEqual([99]);
    expect(result.matches[0]?.sourceRefs[0]).toEqual({
      documentId: "doc-a",
      fileName: "uzun.pdf",
      pages: [99],
      nodeId: null,
    });
  });
});
