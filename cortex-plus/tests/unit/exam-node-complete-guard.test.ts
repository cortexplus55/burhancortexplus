import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), source: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/api/guards", () => ({ withUser: mocks.guard, errorResponse: (status: number, error: string) => Response.json({ error }, { status }) }));
vi.mock("@/lib/ai/generate", () => ({ generateJson: mocks.generate, isPremiumUser: vi.fn() }));
vi.mock("@/lib/learning/source-context", () => ({ EMPTY_SOURCE_CONTEXT: {}, loadSourceContext: mocks.source }));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({ generateExamQuiz: vi.fn() }));
import { POST } from "@/app/api/learning/exam-prep/node/route";

describe("selected source is required before generation", () => {
  it.each([false, true])("stops before generation and attempt insert on source failure: lookup=%s", async lookupFailure => {
    mocks.generate.mockClear();
    mocks.source.mockRejectedValue(new Error("source_unavailable"));
    const insert = vi.fn();
    const from = vi.fn((table: string) => {
      let selected = "";
      const builder = {
        select: (columns: string) => { selected = columns; return builder; },
        eq: () => builder, order: () => builder, limit: () => builder, insert,
        maybeSingle: async () => {
          if (table === "exam_preps") return selected === "document_id"
            ? { data: lookupFailure ? null : { document_id: "document" }, error: lookupFailure ? {} : null }
            : { data: { id: "prep", title: "Biology" } };
          if (table === "exam_prep_nodes") return { data: { id: "node", kind: "true_false", status: "ready" } };
          return { data: null };
        },
      };
      return builder;
    });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from } } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: "00000000-0000-4000-8000-000000000001", nodeId: "00000000-0000-4000-8000-000000000002", action: "start" }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "source_unavailable" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("completion requires a stored active attempt", () => {
  it.each([false, true])("does not mutate progress when attempt lookup fails or is empty: %s", async failed => {
    const update = vi.fn();
    const from = vi.fn((table: string) => {
      const result = table === "exam_preps" ? { data: { id: "prep", title: "Test" } }
        : table === "exam_prep_nodes" ? { data: { id: "node", status: "ready", kind: "quiz" } }
        : table === "exam_prep_node_attempts" ? { data: null, error: failed ? { message: "offline" } : null }
        : { data: null };
      const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, maybeSingle: async () => result, update };
      return builder;
    });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from } } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: "00000000-0000-4000-8000-000000000001", nodeId: "00000000-0000-4000-8000-000000000002", action: "complete", answers: {} }) }));
    expect(response.status).toBe(failed ? 503 : 409);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("completion transaction", () => {
  it.each([false, true])("returns success only after the database commits: failure=%s", async failed => {
    const update = vi.fn();
    const filters: [string, unknown][] = [];
    const attemptId = "00000000-0000-4000-8000-000000000003";
    const rpc = vi.fn().mockResolvedValue(failed
      ? { data: null, error: { message: "transaction failed" } }
      : { data: { score: 0, total: 1, nextId: null }, error: null });
    const from = vi.fn((table: string) => {
      const result = table === "exam_preps" ? { data: { id: "prep", title: "Test" } }
        : table === "exam_prep_nodes" ? { data: { id: "node", status: "ready", kind: "true_false" } }
        : table === "exam_prep_node_attempts" ? { data: { id: attemptId, status: "active", payload: { type: "true_false", items: [{ correct: true }] } } }
        : { data: null };
      const builder = { select: () => builder, eq: (key: string, value: unknown) => { if (table === "exam_prep_node_attempts") filters.push([key, value]); return builder; }, order: () => builder, limit: () => builder, maybeSingle: async () => result, update };
      return builder;
    });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from, rpc } } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: "00000000-0000-4000-8000-000000000001", nodeId: "00000000-0000-4000-8000-000000000002", attemptId, action: "complete", answers: { "0": false } }) }));
    expect(response.status).toBe(failed ? 503 : 200);
    expect(filters).toContainEqual(["id", attemptId]);
    expect(filters).toContainEqual(["user_id", "user"]);
    expect(filters).toContainEqual(["exam_prep_id", "00000000-0000-4000-8000-000000000001"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("complete_exam_prep_node", expect.objectContaining({ p_attempt_id: attemptId, p_score: 0, p_total: 1 }));
    expect(update).not.toHaveBeenCalled();
  });
});
