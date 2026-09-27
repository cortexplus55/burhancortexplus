import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDocumentGenerationContext, representativePages } from "@/lib/documents/generation-context";
import { topicMapWindows } from "@/lib/documents/pdf-learning-v2";

describe("long document coverage", () => {
  it("retrieves the selected topic from physical page 99", async () => {
    const selectedPageQueries: number[][] = [];
    const service = {
      from(table: string) {
        let columns = "";
        let selectedPages: number[] = [];
        const query = {
          select(value: string) { columns = value; return query; },
          eq() { return query; },
          is() { return query; },
          order() { return query; },
          range() { return query; },
          in(_column: string, values: number[]) {
            selectedPages = values;
            selectedPageQueries.push(values);
            return query;
          },
          maybeSingle: async () => ({
            data: { id: "doc99", file_name: "Pediatri.pdf", status: "completed" },
            error: null,
          }),
          then(resolve: (value: unknown) => void) {
            const data = table === "document_topic_nodes"
              ? [{ id: "heart", title: "Pediatrik Kardiyoloji" }]
              : table === "document_topic_page_links"
                ? [{ page_number: 99 }]
                : columns.includes("text_content")
                  ? selectedPages.map((page) => ({
                      page_number: page,
                      text_content: "Kardiyoloji konusu, kalp ve dolaşım sistemini ele alır.",
                      formulas: [], extraction_ok: true, page_kind: "content",
                    }))
                  : Array.from({ length: 99 }, (_, index) => ({
                      page_number: index + 1, headings: index === 98 ? ["Pediatrik Kardiyoloji"] : [],
                      extraction_ok: true, page_kind: "content",
                    }));
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const context = await loadDocumentGenerationContext(service, "user", "doc99", "Kardiyoloji");
    expect(selectedPageQueries).toEqual([[99]]);
    expect(context?.excerpt).toContain("[s.99]");
    expect(context?.excerpt).not.toContain("[s.1]");
  });

  it("samples the physical last page instead of stopping at page 40", () => {
    const pages = representativePages(Array.from({ length: 99 }, (_, index) => index + 1));
    expect(pages).toHaveLength(8);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(99);
    expect(pages.some((page) => page > 40)).toBe(true);
  });

  it("maps each page of a 99-page book in bounded windows", () => {
    const windows = topicMapWindows(Array.from({ length: 99 }, (_, index) => index + 1));
    expect(windows).toHaveLength(9);
    expect(windows.every((window) => window.length <= 12)).toBe(true);
    expect(windows.flat()).toEqual(Array.from({ length: 99 }, (_, index) => index + 1));
  });
});
