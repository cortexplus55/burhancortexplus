import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "./helpers/fake-supabase";
import { clampExamLabel, EXAM_LABEL_MAX_CHARS } from "@/lib/documents/process-session";

const state = vi.hoisted(() => ({ service: null as unknown }));

vi.mock("@/lib/api/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/guards")>();
  return {
    ...actual,
    withUser: async () => ({ ok: true, ctx: { userId: "u1", service: state.service } }),
  };
});
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/feature-flags")>();
  return { ...actual, isFeatureEnabled: async () => true };
});

const DOC = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("free-text subject never blocks processing", () => {
  beforeEach(() => {
    state.service = makeFakeDb({ documents: [] }).client;
  });

  it("clamps to 40 characters and ignores labels shorter than 2", () => {
    expect(clampExamLabel("A")).toBeUndefined();
    expect(clampExamLabel("  KPSS   Genel  ")).toBe("KPSS Genel");
    expect(clampExamLabel("x".repeat(60))).toHaveLength(EXAM_LABEL_MAX_CHARS);
    expect(clampExamLabel(42)).toBeUndefined();
  });

  for (const subject of ["A", "Ç".repeat(60)]) {
    it(`process route accepts subject of length ${subject.length}`, async () => {
      const { POST } = await import("@/app/api/documents/process/route");
      const res = await POST(post({ documentId: DOC, examType: subject }));
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(404); // parsed fine, document simply absent
    });

    it(`intake probe accepts subject of length ${subject.length}`, async () => {
      const { POST } = await import("@/app/api/learning/exam-prep/intake/route");
      const res = await POST(post({ documentIds: [DOC], examType: subject, probeOnly: true }));
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(404);
    });
  }
});
