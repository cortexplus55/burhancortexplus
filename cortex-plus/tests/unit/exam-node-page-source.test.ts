import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  search: vi.fn(),
  generate: vi.fn(),
  quiz: vi.fn(),
}));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: mocks.generate,
  isPremiumUser: vi.fn().mockResolvedValue(true),
}));
// Keep the actual page reader and route; only external retrieval/model calls
// are mocked, so a missing export or a bypassed reader cannot pass this test.
vi.mock("@/lib/rag/pipeline", () => ({ searchDocumentChunks: mocks.search }));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({ generateExamQuiz: mocks.quiz }));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/learning/exam-prep/node/route";

describe("exam activity with an incomplete physical page source", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["lesson", "quiz", "true_false", "flashcards", "podcast", "oral", "written_exam"])(
    "%s stops before retrieval fallback, generation, or progress/credit writes",
    async (kind) => {
      const write = vi.fn();
      const pageFilter = vi.fn().mockReturnThis();
      const from = vi.fn((table: string) => {
        const data = table === "exam_preps"
          ? { id: "prep", title: "Trigonometri", document_id: "document", active_topic_id: "topic" }
          : table === "exam_prep_nodes"
          ? { id: "node", kind, status: "ready", session_meta: { topicTitle: "Açı ölçüleri", sourcePages: [3, 4] } }
          : table === "documents"
          ? { file_name: "trigonometri.pdf", source_boundary_mode: "documents_only" }
          : null;
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          in: pageFilter,
          order: vi.fn().mockResolvedValue({ data: [
            { page_number: 3, text_content: "Derece ve radyan açı ölçüleridir.", formulas: ["180° = π rad"], extraction_ok: true, page_kind: "content" },
          ], error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          insert: write, update: write, upsert: write,
        };
        return builder;
      });
      mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from, rpc: write } } });

      const response = await POST(new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: "00000000-0000-4000-8000-000000000001",
          nodeId: "00000000-0000-4000-8000-000000000002",
          clientRequestId: "00000000-0000-4000-8000-000000000003",
          action: "start",
        }),
      }));

      expect(pageFilter).toHaveBeenCalledExactlyOnceWith("page_number", [3, 4]);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "source_unavailable" });
      expect(mocks.search).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.quiz).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    },
  );
});
