import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Production showed adaptive_master_plans=1 and adaptive_daily_plans=1 (the
 * planning overlay ran) but adaptive_learning_sessions=0 — the loop never
 * reached session/start. session-engine.ts had zero direct test coverage,
 * so a persistence regression here would have shipped silently. These tests
 * pin startSession's actual insert behavior.
 */
describe("startSession persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockResolvedValue(null),
    }));
  });

  function serviceDouble() {
    const inserted: Record<string, unknown>[] = [];
    const sessionRow = {
      id: "session-1",
      exam_prep_id: "prep-1",
      started_at: "2026-09-27T10:00:00.000Z",
      planned_duration_minutes: 45,
      objective: "Bugünkü çalışma",
      current_topic_id: null,
      current_step: 0,
      completion_pct: 0,
      status: "active",
    };
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({ data: null, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              inserted.push(row);
              return {
                select: () => ({
                  single: async () => ({ data: sessionRow, error: null }),
                }),
              };
            },
          };
        }
        if (table === "adaptive_learning_events") {
          return { insert: async (row: Record<string, unknown>) => (inserted.push(row), { error: null }) };
        }
        throw new Error(`unexpected table in test double: ${table}`);
      },
    };
    return { service, inserted, sessionRow };
  }

  it("inserts a session row with user, prep, status active, and the current policy version", async () => {
    const { service, inserted } = serviceDouble();
    const { startSession } = await import("@/lib/adaptive/session-engine");
    const { ADAPTIVE_POLICY_VERSION } = await import("@/lib/adaptive/types");

    const result = await startSession(service as never, {
      userId: "user-1",
      examPrepId: "prep-1",
      objective: "Bugünkü çalışma",
    });

    const sessionInsert = inserted.find((row) => row.status === "active");
    expect(sessionInsert).toMatchObject({
      user_id: "user-1",
      exam_prep_id: "prep-1",
      status: "active",
      policy_version: ADAPTIVE_POLICY_VERSION,
      objective: "Bugünkü çalışma",
    });
    expect(result.session.id).toBe("session-1");
    expect(result.session.status).toBe("active");
  });

  it("records a session_started event alongside the session row", async () => {
    const { service, inserted } = serviceDouble();
    const { startSession } = await import("@/lib/adaptive/session-engine");

    await startSession(service as never, { userId: "user-1", examPrepId: "prep-1" });

    const event = inserted.find((row) => row.event_type === "session_started");
    expect(event).toMatchObject({ user_id: "user-1", exam_prep_id: "prep-1", session_id: "session-1" });
  });

  it("reuses an existing active session instead of inserting a second one", async () => {
    const inserted: Record<string, unknown>[] = [];
    const existingSession = {
      id: "session-existing",
      exam_prep_id: "prep-1",
      started_at: "2026-09-27T09:00:00.000Z",
      planned_duration_minutes: 45,
      objective: "Devam eden oturum",
      current_topic_id: null,
      current_step: 1,
      completion_pct: 20,
      status: "active",
    };
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({ data: existingSession, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              inserted.push(row);
              return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
            },
          };
        }
        throw new Error(`unexpected table in test double: ${table}`);
      },
    };
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const result = await startSession(service as never, { userId: "user-1", examPrepId: "prep-1" });

    expect(inserted).toHaveLength(0);
    expect(result.session.id).toBe("session-existing");
  });

  it("throws (does not silently swallow) when the insert fails", async () => {
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                    }),
                  }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { message: "relation does not exist" } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table in test double: ${table}`);
      },
    };
    const { startSession } = await import("@/lib/adaptive/session-engine");

    await expect(
      startSession(service as never, { userId: "user-1", examPrepId: "prep-1" }),
    ).rejects.toThrow("relation does not exist");
  });
});
