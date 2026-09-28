import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(false),
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
}));

import { POST } from "@/app/api/learning/exam-prep/intro/route";

const PREP = "00000000-0000-4000-8000-000000000001";
const TOPIC_A = "00000000-0000-4000-8000-000000000002";
const TOPIC_B = "00000000-0000-4000-8000-000000000003";
const ATTEMPT_A = "00000000-0000-4000-8000-000000000004";
const ATTEMPT_B = "00000000-0000-4000-8000-000000000005";

function serviceWithAttempts(includeSecond: boolean) {
  const unlocked: string[] = [];
  const attempts = [
    { id: ATTEMPT_A, topic_id: TOPIC_A, payload: { mode: "legacy", questions: [{ text: "Açıyı ölç.", options: ["A", "B"], correct: ["A"], multi: false }] } },
    ...(includeSecond ? [{ id: ATTEMPT_B, topic_id: TOPIC_B, payload: { mode: "legacy", questions: [{ text: "Birim çemberde x nedir?", options: ["cos θ", "sin θ"], correct: ["cos θ"], multi: false }] } }] : []),
  ];
  const attemptFilters: Array<[string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      update: () => builder,
      eq: (key: string, value: unknown) => { filters.push([key, value]); if (table === "exam_prep_intro_attempts") attemptFilters.push([key, value]); return builder; },
      order: () => table === "exam_prep_nodes"
        ? Promise.resolve({ data: [
          { id: "first-topic-node", status: "ready", sort_order: 1, session_meta: { topicId: TOPIC_A, topicTitle: "Açı Ölçüsü" } },
          { id: "selected-topic-node", status: "locked", sort_order: 2, session_meta: { topicId: TOPIC_B, topicTitle: "Birim Çember" } },
        ] })
        : builder,
      limit: () => builder,
      then: (resolve: (value: { error: null }) => unknown) => {
        if (table === "exam_prep_nodes") unlocked.push(String(filters.find(([key]) => key === "id")?.[1] ?? ""));
        return Promise.resolve(resolve({ error: null }));
      },
      maybeSingle: async () => {
        if (table === "exam_preps") return { data: { id: PREP, title: "Trigonometri", exam_type: "Matematik", active_topic_id: TOPIC_B, intro_completed_at: null, document_id: null, source_document_ids: [] } };
        if (table === "exam_prep_nodes") return { data: { id: "next-node" } };
        if (table === "exam_prep_topics") return { data: { id: TOPIC_B, label: "Birim Çember", document_topic_node_id: null, source_refs: [] } };
        if (table === "exam_prep_intro_attempts") return { data: attempts.find((attempt) => filters.every(([key, value]) => key === "user_id" || key === "exam_prep_id" || key === "status" || (attempt as Record<string, unknown>)[key] === value)) ?? null };
        return { data: null };
      },
    };
    return builder;
  });
  return { from, attemptFilters, unlocked };
}

describe("intro attempt follows the selected topic", () => {
  it("resumes the second topic's own question instead of the first topic's active attempt", async () => {
    const service = serviceWithAttempts(true);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student", service } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: PREP, action: "start" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attemptId: ATTEMPT_B, topicLabel: "Birim Çember", questions: [{ text: "Birim çemberde x nedir?" }] });
    expect(service.attemptFilters).toContainEqual(["topic_id", TOPIC_B]);
  });

  it("cannot complete a first-topic attempt while the second topic is selected", async () => {
    const service = serviceWithAttempts(false);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student", service } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: PREP, attemptId: ATTEMPT_A, action: "complete", answers: { "0": "A" } }) }));
    expect(response.status).toBe(400);
    expect(service.attemptFilters).toContainEqual(["topic_id", TOPIC_B]);
    expect(service.attemptFilters).toContainEqual(["id", ATTEMPT_A]);
  });

  it("deferring the test opens the selected topic rather than the first ready topic", async () => {
    const service = serviceWithAttempts(false);
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "student", service } });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ prepId: PREP, action: "skip" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ nextHref: `/deneme-sinavlari/${PREP}/dugum/selected-topic-node` });
    expect(service.unlocked).toContain("selected-topic-node");
  });
});
