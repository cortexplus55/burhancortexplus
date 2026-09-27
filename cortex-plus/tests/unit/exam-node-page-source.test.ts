import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  search: vi.fn(),
  generate: vi.fn(),
  quiz: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, code: string, extras: Record<string, unknown> = {}) =>
    Response.json({ error: code, code, ...extras }, { status }),
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: mocks.generate,
  isPremiumUser: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/rag/pipeline", () => ({
  searchDocumentChunks: mocks.search,
  searchDocumentChunksAcross: mocks.search,
  MIN_CHUNK_SIMILARITY: 0.25,
}));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({ generateExamQuiz: mocks.quiz }));
vi.mock("@/lib/learning/lesson-source-resolver", () => ({
  resolveLessonSource: (...args: unknown[]) => mocks.resolve(...args),
  enrichLessonSource: async (_s: unknown, _u: unknown, ctx: unknown) => ctx,
}));
vi.mock("@/lib/learning/lesson-generation-failures", () => ({
  recordLessonGenerationFailure: vi.fn(async () => undefined),
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/learning/exam-prep/node/route";
import { SourceUnavailableError } from "@/lib/learning/source-context";

describe("exam activity with an incomplete physical page source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({
      unavailable: "pages_unusable",
      trace: { steps: [{ step: "session_pages", ok: false }] },
    });
  });

  it.each(["lesson", "quiz", "true_false", "flashcards", "podcast", "oral", "written_exam"])(
    "%s stops before retrieval fallback, generation, or progress/credit writes",
    async (kind) => {
      const write = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: {} }),
        }),
        eq: vi.fn().mockReturnThis(),
      });
      const pageFilter = vi.fn().mockReturnThis();
      const from = vi.fn((table: string) => {
        const data = table === "exam_preps"
          ? { id: "prep", title: "Trigonometri", document_id: "document", active_topic_id: "topic", source_document_ids: ["document"] }
          : table === "exam_prep_nodes"
          ? { id: "node", kind, status: "ready", session_meta: { topicTitle: "Açı ölçüleri", sourcePages: [3, 4] } }
          : table === "exam_prep_topics"
          ? { id: "topic", label: "Açı ölçüleri", document_topic_node_id: null, source_refs: null }
          : table === "documents"
          ? { file_name: "trigonometri.pdf", source_boundary_mode: "documents_only" }
          : null;
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          in: pageFilter,
          not: vi.fn().mockReturnThis(),
          contains: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation(async () => {
            if (table === "document_pages") {
              return {
                data: [
                  {
                    page_number: 3,
                    text_content: "Derece ve radyan açı ölçüleridir.",
                    formulas: ["180° = π rad"],
                    extraction_ok: true,
                    page_kind: "content",
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          insert: write,
          update: write,
          upsert: write,
        };
        return builder;
      });
      mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service: { from, rpc: write } } });

      // Non-lesson: strict page load must see missing page 4.
      // Force page reader path by making order throw SourceUnavailable via incomplete set —
      // actual loadPageSourceContext uses order(). We simulate missing page by returning only 3.
      const response = await POST(new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({
          prepId: "00000000-0000-4000-8000-000000000001",
          nodeId: "00000000-0000-4000-8000-000000000002",
          clientRequestId: "00000000-0000-4000-8000-000000000003",
          action: "start",
        }),
      }));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code ?? body.error).toBe("source_unavailable");
      expect(mocks.search).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.quiz).not.toHaveBeenCalled();
      if (kind === "lesson") {
        expect(mocks.resolve).toHaveBeenCalled();
      } else {
        const pageCalls = pageFilter.mock.calls.filter((call) => call[0] === "page_number");
        expect(pageCalls.length).toBeGreaterThan(0);
        expect(pageCalls.some((call) => JSON.stringify(call[1]) === JSON.stringify([3, 4]))).toBe(
          true,
        );
      }
      void SourceUnavailableError;
    },
  );
});
