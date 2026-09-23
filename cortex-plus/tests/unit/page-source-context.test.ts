import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPageSourceContext, SourceUnavailableError } from "@/lib/learning/source-context";

type PageRow = {
  page_number: number;
  text_content: string | null;
  formulas: string[];
  extraction_ok?: boolean | null;
  page_kind?: string | null;
};

function sourceService(rows: PageRow[] | null, options: { pagesError?: boolean; docError?: boolean; noDoc?: boolean } = {}) {
  const filter = vi.fn().mockReturnThis();
  const pages = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: filter,
    order: vi.fn().mockResolvedValue({ data: rows, error: options.pagesError ? { message: "read failed" } : null }),
  };
  const doc = {
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.noDoc ? null : { file_name: "trigonometri.pdf" },
      error: options.docError ? { message: "read failed" } : null,
    }),
  };
  const from = vi.fn((table: string) => table === "documents" ? doc : pages);
  return { service: { from } as unknown as SupabaseClient, filter, from, doc };
}

const first = { page_number: 3, text_content: "Derece ve radyan açı ölçüleridir.", formulas: ["180° = π rad"] };
const second = { page_number: 4, text_content: "Birim çemberin yarıçapı birdir.", formulas: [] };

describe("required physical page source", () => {
  it("includes each requested readable physical page and deduplicates the query", async () => {
    const { service, filter, doc } = sourceService([first, second]);
    const source = await loadPageSourceContext(service, "user", "document", [4, 3, 4]);
    expect(filter).toHaveBeenCalledWith("page_number", [3, 4]);
    expect(doc.eq).toHaveBeenCalledWith("user_id", "user");
    expect(doc.is).toHaveBeenCalledWith("deleted_at", null);
    expect(source.block).toContain("[s.3]");
    expect(source.block).toContain("[s.4]");
    expect(source.formulas).toContain("180° = π rad");
  });

  it.each([
    { name: "missing page", rows: [first] },
    { name: "empty page", rows: [first, { ...second, text_content: " " }] },
    { name: "failed extraction", rows: [first, { ...second, extraction_ok: false }] },
    { name: "unreadable page", rows: [first, { ...second, page_kind: "unreadable" }] },
    { name: "all pages missing", rows: [] },
  ])("rejects $name instead of accepting a partial source", async ({ rows }) => {
    const { service } = sourceService(rows);
    await expect(loadPageSourceContext(service, "user", "document", [3, 4])).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it.each([{ pagesError: true }, { docError: true }, { noDoc: true }])("rejects lookup failure: %j", async (options) => {
    const { service } = sourceService([first, second], options);
    await expect(loadPageSourceContext(service, "user", "document", [3, 4])).rejects.toThrow("source_unavailable");
  });

  it("allows the existing retrieval fallback only when no page list was supplied", async () => {
    const { service, from } = sourceService([]);
    expect((await loadPageSourceContext(service, "user", "document", undefined)).block).toBe("");
    expect(from).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects an invalid physical page number (%s) before querying", async (number) => {
    const { service, from } = sourceService([first]);
    await expect(loadPageSourceContext(service, "user", "document", [3, number])).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(from).not.toHaveBeenCalled();
  });

  it("does not put unrequested pages into the model context", async () => {
    const { service } = sourceService([first, second]);
    const source = await loadPageSourceContext(service, "user", "document", [3]);
    expect(source.block).toContain("[s.3]");
    expect(source.block).not.toContain("[s.4]");
  });
});
