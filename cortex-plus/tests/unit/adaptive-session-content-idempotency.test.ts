import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Companion to adaptive-session-resume-idempotency.test.ts. That file proves
 * startSession() stops minting a new decision on resume. This file proves
 * the other half of the production bug: with a stable decisionTraceId, the
 * *content* layer (question/passage/choices + the intervention_started
 * event) does not regenerate either.
 *
 * Critically, the cache that makes this work — action-content/store.ts — is
 * a real Postgres table (adaptive_learning_events), not an in-memory or
 * process-local cache. generate-action-content.ts has no cache of its own;
 * it is called only on a genuine miss. So there is nothing here that a
 * Vercel cold start, a different serverless instance, or a fresh deployment
 * could invalidate. This test exercises the actual POST handler twice
 * through two independently-constructed fake "service" objects (only the
 * underlying events array is shared, standing in for the real external
 * Postgres table) to demonstrate that instance identity plays no role.
 */

type Row = Record<string, unknown>;

function makeQueryBuilder(rows: Row[]) {
  const filters: [string, unknown][] = [];
  const builder = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    async maybeSingle() {
      const data = rows.find((r) => filters.every(([c, v]) => r[c] === v));
      return { data: data ?? null, error: null };
    },
  };
  return builder;
}

function sessionsTableDouble(rows: Row[]) {
  return {
    select() {
      return makeQueryBuilder(rows);
    },
  };
}

/** Faithful enough stand-in for the real adaptive_learning_events table for
 * the two queries action-content/store.ts issues against it. */
function eventsTableDouble(events: Row[]) {
  return {
    select() {
      return makeQueryBuilder(events);
    },
    insert: async (row: Row) => {
      events.push({ id: `evt-${events.length + 1}`, ...row });
      return { error: null };
    },
  };
}

// Valid RFC4122 shape (version nibble 4, variant nibble in 8-b) — zod's
// z.string().uuid() rejects the all-same-digit shorthand otherwise.
const DECISION_TRACE_ID = "11111111-1111-4111-8111-111111111111";
const EXAM_PREP_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const TOPIC_ID = "44444444-4444-4444-8444-444444444444";

function makeRequest() {
  return new Request("https://x/api/adaptive/session/content", {
    method: "POST",
    body: JSON.stringify({
      examPrepId: EXAM_PREP_ID,
      sessionId: SESSION_ID,
      action: {
        action: "teach",
        topicId: TOPIC_ID,
        topicKey: "topluluk-dagilisi",
        teachingMode: "explanation",
        difficulty: "medium",
        model: "gpt-4o-mini",
        durationTarget: 20,
        reasonCode: "PLAN_OBJECTIVE",
        reasonCopy: "",
        decisionTraceId: DECISION_TRACE_ID,
      },
    }),
  });
}

describe("adaptive session content resume idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("same decisionTraceId across two independent service instances: exactly 1 generation, 1 intervention, identical content", async () => {
    let genCalls = 0;
    vi.doMock("@/lib/adaptive/action-content/generate-action-content", () => ({
      generateActionContent: vi.fn().mockImplementation(async () => {
        genCalls += 1;
        return {
          id: `content-${genCalls}`,
          action: "teach",
          kind: "explanation",
          topicId: TOPIC_ID,
          topicKey: "topluluk-dagilisi",
          title: `Topluluğun Dağılışı ve Mirası (gen #${genCalls})`,
          bodyMarkdown: `body-${genCalls}`,
          sourceRefs: [],
          model: "gpt-4o-mini",
          escalationReasons: [],
          decisionTraceId: DECISION_TRACE_ID,
        };
      }),
      publicActionContent: (c: unknown) => c,
    }));
    vi.doMock("@/lib/adaptive/exam-graph", () => ({
      loadExamGraph: vi.fn().mockResolvedValue({
        topics: [{ topicKey: "topluluk-dagilisi", title: "Topluluğun Dağılışı", sourceRefs: [] }],
      }),
    }));
    const guardBox: { service: unknown } = { service: null };
    vi.doMock("@/lib/adaptive/api-guard", () => ({
      withAdaptiveUser: vi.fn().mockImplementation(async () => ({
        ok: true,
        ctx: { userId: "u1", service: guardBox.service },
      })),
      assertPrepOwner: vi.fn().mockResolvedValue(true),
    }));

    const { POST } = await import("@/app/api/adaptive/session/content/route");

    // The single "real Postgres table" both fake service instances share —
    // standing in for the actual external DB two different serverless
    // instances would both read/write.
    const sharedEvents: Row[] = [];
    const sharedSessions: Row[] = [
      { id: SESSION_ID, user_id: "u1", exam_prep_id: EXAM_PREP_ID },
    ];

    function freshServiceInstance() {
      // A brand-new object graph every call, exactly as a cold Vercel
      // lambda would construct its own Supabase client — nothing here is
      // reused or warm between "instances" except sharedEvents/Sessions.
      return {
        from(table: string) {
          if (table === "adaptive_learning_sessions") return sessionsTableDouble(sharedSessions);
          if (table === "adaptive_learning_events") return eventsTableDouble(sharedEvents);
          throw new Error(`unexpected table: ${table}`);
        },
      };
    }

    // "Instance A" generates the content for the first time.
    guardBox.service = freshServiceInstance();
    const first = await POST(makeRequest());
    const firstBody = (await first.json()) as { ok: boolean; content: { title: string }; cached: boolean };

    expect(genCalls).toBe(1);
    expect(firstBody.cached).toBe(false);
    expect(sharedEvents.filter((e) => e.event_type === "intervention_started")).toHaveLength(1);

    // "Instance B" — a completely separate service object, simulating a
    // page reload landing on a different cold-started serverless instance —
    // requests content for the exact same decisionTraceId.
    guardBox.service = freshServiceInstance();
    const second = await POST(makeRequest());
    const secondBody = (await second.json()) as { ok: boolean; content: { title: string }; cached: boolean };

    // No second generation call, no second intervention event, identical
    // content served from the shared DB-backed cache.
    expect(genCalls).toBe(1);
    expect(secondBody.cached).toBe(true);
    expect(secondBody.content.title).toBe(firstBody.content.title);
    expect(sharedEvents.filter((e) => e.event_type === "intervention_started")).toHaveLength(1);
  });
});
