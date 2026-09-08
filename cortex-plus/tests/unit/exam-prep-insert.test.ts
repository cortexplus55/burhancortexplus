import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";

const input = { userId: "user", title: "Test", examType: "Okul", topics: ["Konu"], examDate: "2026-09-21", documentId: "document" };

describe("atomic exam prep creation", () => {
  it("passes the source and all children in a single transaction", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "prep-id", error: null });
    const from = vi.fn();
    const result = await insertExamPrepGraph({ rpc, from } as unknown as SupabaseClient, input);
    expect(result).toMatchObject({ prepId: "prep-id" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_exam_prep_graph", {
      p_input: expect.objectContaining({ documentId: "document", topics: ["Konu"], tasks: expect.any(Array), nodes: expect.any(Array) }),
    });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: "source_not_ready" } },
    { data: null, error: { message: "child insert failed" } },
    { data: null, error: { message: "function unavailable" } },
    { data: null, error: null },
  ])("fails without a source-free or non-atomic fallback: %j", async response => {
    const rpc = vi.fn().mockResolvedValue(response);
    const from = vi.fn();
    expect(await insertExamPrepGraph({ rpc, from } as unknown as SupabaseClient, input))
      .toEqual({ error: "generation_failed" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });
});
