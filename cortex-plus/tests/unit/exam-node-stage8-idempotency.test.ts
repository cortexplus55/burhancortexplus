import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  source: vi.fn(),
  generate: vi.fn(),
  quiz: vi.fn(),
  flag: vi.fn(),
}));

vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, error: string) =>
    Response.json({ error }, { status }),
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: mocks.generate,
  isPremiumUser: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/learning/source-context", () => ({
  EMPTY_SOURCE_CONTEXT: { block: "" },
  loadSourceContext: mocks.source,
}));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: mocks.quiz,
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: mocks.flag,
}));

import { POST } from "@/app/api/learning/exam-prep/node/route";

const PREP = "00000000-0000-4000-8000-000000000001";
const NODE = "00000000-0000-4000-8000-000000000002";
const ATTEMPT = "00000000-0000-4000-8000-000000000003";
const GEN = "00000000-0000-4000-8000-000000000004";
const REQ = "00000000-0000-4000-8000-000000000005";
const COMPLETE_REQ = "00000000-0000-4000-8000-000000000006";

function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.gt = self;
  builder.is = self;
  builder.order = self;
  builder.limit = self;
  builder.insert = self;
  builder.update = self;
  builder.upsert = self;
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  return builder;
}

describe("stage 8 idempotent start", () => {
  it("returns the same ready attempt for a repeated clientRequestId without regenerating", async () => {
    mocks.flag.mockResolvedValue(true);
    mocks.quiz.mockClear();
    mocks.source.mockClear();
    const payload = {
      type: "true_false",
      items: [{ text: "x", correct: true, explanation: "e" }],
    };
    const from = vi.fn((table: string) => {
      if (table === "exam_preps") {
        return chain({ data: { id: PREP, title: "T", exam_type: "yks", active_topic_id: null, target_score: null } });
      }
      if (table === "exam_prep_nodes") {
        return chain({
          data: {
            id: NODE,
            kind: "true_false",
            title: "TF",
            status: "ready",
            sort_order: 1,
            session_meta: null,
          },
        });
      }
      if (table === "exam_prep_topics") {
        return chain({ data: null });
      }
      if (table === "exam_prep_node_attempts") {
        return chain({
          data: {
            id: ATTEMPT,
            status: "active",
            payload,
            answers: { "0": true },
            answer_meta: { cursorIndex: 0 },
            score: null,
            total: 1,
            generation_id: GEN,
            client_request_id: REQ,
            complete_request_id: null,
            content_version: 2,
            updated_at: new Date().toISOString(),
            voice_mode: false,
          },
        });
      }
      return chain({ data: null });
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      ctx: { userId: "user", service: { from } },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          action: "start",
          clientRequestId: REQ,
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.attemptId).toBe(ATTEMPT);
    expect(body.generationId).toBe(GEN);
    expect(body.resumed).toBe(true);
    expect(mocks.quiz).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
});

describe("stage 8 double complete", () => {
  it("returns stored score without re-running complete rpc side effects twice", async () => {
    mocks.flag.mockResolvedValue(true);
    const rpc = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "exam_preps") {
        return chain({
          data: { id: PREP, title: "T", exam_type: "yks", active_topic_id: null, target_score: null },
        });
      }
      if (table === "exam_prep_nodes") {
        return chain({
          data: {
            id: NODE,
            kind: "true_false",
            title: "TF",
            status: "done",
            sort_order: 1,
            session_meta: null,
          },
        });
      }
      if (table === "exam_prep_topics") return chain({ data: null });
      if (table === "exam_prep_node_attempts") {
        return chain({
          data: {
            id: ATTEMPT,
            status: "completed",
            payload: { type: "true_false", items: [{ correct: true }] },
            answers: { "0": true },
            score: 1,
            total: 1,
            generation_id: GEN,
            client_request_id: REQ,
            complete_request_id: COMPLETE_REQ,
            content_version: 3,
          },
        });
      }
      return chain({ data: null });
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      ctx: { userId: "user", service: { from, rpc } },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          attemptId: ATTEMPT,
          action: "complete",
          generationId: GEN,
          completeRequestId: COMPLETE_REQ,
          answers: { "0": true },
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.score).toBe(1);
    expect(body.idempotent).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects complete when generationId does not match the live attempt", async () => {
    mocks.flag.mockResolvedValue(true);
    const rpc = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "exam_preps") {
        return chain({
          data: { id: PREP, title: "T", exam_type: "yks", active_topic_id: null, target_score: null },
        });
      }
      if (table === "exam_prep_nodes") {
        return chain({
          data: {
            id: NODE,
            kind: "true_false",
            title: "TF",
            status: "ready",
            sort_order: 1,
            session_meta: null,
          },
        });
      }
      if (table === "exam_prep_topics") return chain({ data: null });
      if (table === "exam_prep_node_attempts") {
        return chain({
          data: {
            id: ATTEMPT,
            status: "active",
            payload: { type: "true_false", items: [{ correct: true }] },
            answers: {},
            score: null,
            total: 1,
            generation_id: GEN,
            client_request_id: REQ,
            complete_request_id: null,
            content_version: 1,
          },
        });
      }
      return chain({ data: null });
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      ctx: { userId: "user", service: { from, rpc } },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          attemptId: ATTEMPT,
          action: "complete",
          generationId: "00000000-0000-4000-8000-000000000099",
          answers: { "0": true },
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale_generation" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("stage 8 resume + last answer in score", () => {
  it("resumes an active attempt with saved answers", async () => {
    mocks.flag.mockResolvedValue(true);
    const from = vi.fn((table: string) => {
      if (table === "exam_preps") {
        return chain({
          data: { id: PREP, title: "T", exam_type: "yks", active_topic_id: null, target_score: null },
        });
      }
      if (table === "exam_prep_nodes") {
        return chain({
          data: {
            id: NODE,
            kind: "quiz",
            title: "Q",
            status: "ready",
            sort_order: 1,
            session_meta: null,
          },
        });
      }
      if (table === "exam_prep_topics") return chain({ data: null });
      if (table === "exam_prep_node_attempts") {
        return chain({
          data: {
            id: ATTEMPT,
            status: "active",
            payload: {
              type: "quiz",
              questions: [
                {
                  text: "q1",
                  options: ["A", "B"],
                  correct: ["A"],
                  multi: false,
                },
              ],
            },
            answers: { "0": "A" },
            answer_meta: { cursorIndex: 0 },
            score: null,
            total: 1,
            generation_id: GEN,
            client_request_id: REQ,
            complete_request_id: null,
            content_version: 2,
            voice_mode: false,
          },
        });
      }
      return chain({ data: null });
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      ctx: { userId: "user", service: { from } },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ prepId: PREP, nodeId: NODE, action: "resume" }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.answers["0"]).toBe("A");
    expect(body.attemptId).toBe(ATTEMPT);
  });

  it("scores using merged saved answers when complete body omits the last question", async () => {
    mocks.flag.mockResolvedValue(true);
    const rpc = vi.fn().mockResolvedValue({
      data: { score: 1, total: 1, nextId: null },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "exam_preps") {
        return chain({
          data: { id: PREP, title: "T", exam_type: "yks", active_topic_id: null, target_score: 70 },
        });
      }
      if (table === "exam_prep_nodes") {
        return chain({
          data: {
            id: NODE,
            kind: "true_false",
            title: "TF",
            status: "ready",
            sort_order: 1,
            session_meta: null,
          },
        });
      }
      if (table === "exam_prep_topics") return chain({ data: null });
      if (table === "exam_prep_node_attempts") {
        return chain({
          data: {
            id: ATTEMPT,
            status: "active",
            payload: {
              type: "true_false",
              items: [{ text: "x", correct: true, explanation: "e" }],
            },
            // Last answer already persisted before disconnect.
            answers: { "0": true },
            score: null,
            total: 1,
            generation_id: GEN,
            client_request_id: REQ,
            complete_request_id: null,
            content_version: 2,
          },
        });
      }
      if (table === "exam_prep_misconceptions") return chain({ data: null });
      if (table === "exam_prep_generation_jobs") return chain({ data: null });
      return chain({ data: null });
    });
    mocks.guard.mockResolvedValue({
      ok: true,
      ctx: { userId: "user", service: { from, rpc } },
    });

    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: PREP,
          nodeId: NODE,
          attemptId: ATTEMPT,
          action: "complete",
          generationId: GEN,
          completeRequestId: COMPLETE_REQ,
          // Empty client body after refresh — saved answers must still score.
          answers: {},
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "complete_exam_prep_node",
      expect.objectContaining({
        p_attempt_id: ATTEMPT,
        p_score: 1,
        p_total: 1,
        p_answers: { "0": true },
      }),
    );
  });
});
