import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Production, 2026-09-27: one click on "Çalışmaya Başla" followed by one
 * page reload (zero new student input) produced two `openai_decision`
 * rows and two `intervention_started` events for the same topic at the
 * same timestamp — confirmed live via /admin/adaptive. Root cause:
 * startSession() called nextAction() unconditionally on every resume of an
 * existing active session, and nextAction() always mints a fresh
 * decisionTraceId, which the content cache (keyed by decisionTraceId) always
 * misses. These tests pin the fix: resuming an active session with an
 * unanswered pending action must replay it verbatim — no new decision, no
 * new intervention, no new decisionTraceId — until that action is answered.
 */

type Row = Record<string, unknown>;

type Builder = {
  eq: (col: string, val: unknown) => Builder;
  order: (col: string, opts?: { ascending?: boolean }) => Builder;
  limit: (n: number) => Builder;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (resolve: (v: { data: Row[]; error: null }) => void) => void;
};

/** Generic fake Postgrest-style query builder shared by every fake table. */
function makeQueryBuilder(rows: Row[]): Builder {
  const filters: [string, unknown][] = [];
  let limitN: number | null = null;
  let orderDesc = false;
  const filtered = () => {
    let out = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    if (orderDesc) {
      out = [...out].sort((a, b) =>
        String(b.created_at ?? b.started_at ?? "").localeCompare(
          String(a.created_at ?? a.started_at ?? ""),
        ),
      );
    }
    if (limitN != null) out = out.slice(0, limitN);
    return out;
  };
  const builder: Builder = {
    eq(col, val) {
      filters.push([col, val]);
      return builder;
    },
    order(_col, opts) {
      orderDesc = opts?.ascending === false;
      return builder;
    },
    limit(n) {
      limitN = n;
      return builder;
    },
    async maybeSingle() {
      return { data: filtered()[0] ?? null, error: null };
    },
    then(resolve) {
      resolve({ data: filtered(), error: null });
    },
  };
  return builder;
}

function makeUpdateBuilder(rows: Row[], patch: Row) {
  const filters: [string, unknown][] = [];
  const builder = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    then(resolve: (v: { data: null; error: null }) => void) {
      for (const r of rows) {
        if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
      }
      resolve({ data: null, error: null });
    },
  };
  return builder;
}

function sessionsTableDouble(rows: Row[], opts: { forceInsertConflictOnce?: boolean } = {}) {
  let idCounter = rows.length;
  let conflictPending = opts.forceInsertConflictOnce ?? false;
  return {
    select() {
      return makeQueryBuilder(rows);
    },
    insert(row: Row) {
      if (conflictPending) {
        conflictPending = false;
        return {
          select: () => ({
            single: async () => ({ data: null, error: { code: "23505", message: "duplicate key value" } }),
          }),
        };
      }
      const newRow: Row = {
        id: `session-${++idCounter}`,
        user_id: row.user_id,
        exam_prep_id: row.exam_prep_id,
        started_at: new Date(Date.now() + idCounter).toISOString(),
        planned_duration_minutes: row.planned_duration_minutes ?? 45,
        objective: row.objective ?? "",
        current_topic_id: null,
        current_topic_key: null,
        current_step: 0,
        completion_pct: 0,
        status: row.status ?? "active",
        pending_decision_trace_id: null,
        pending_action: null,
      };
      rows.push(newRow);
      return {
        select: () => ({
          single: async () => ({ data: { ...newRow }, error: null }),
        }),
      };
    },
    update(patch: Row) {
      return makeUpdateBuilder(rows, patch);
    },
  };
}

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

function reviewsTableDouble(reviews: Row[]) {
  return {
    select() {
      return makeQueryBuilder(reviews);
    },
    update(patch: Row) {
      return makeUpdateBuilder(reviews, patch);
    },
    insert: async (row: Row) => {
      reviews.push(row);
      return { error: null };
    },
  };
}

function makeAction(n: number) {
  return {
    action: "teach",
    topicId: "topic-1",
    topicKey: "topluluk-dagilisi",
    teachingMode: "explanation",
    difficulty: "medium",
    model: "gpt-4o-mini",
    durationTarget: 20,
    sourceRefs: [],
    reasonCode: "PLAN_OBJECTIVE",
    reasonCopy: "",
    decisionTraceId: `decision-${n}`,
  };
}

function mockStudentStateNull() {
  vi.doMock("@/lib/adaptive/student-state", () => ({
    loadStudentState: vi.fn().mockResolvedValue(null),
    persistTopicMastery: vi.fn().mockResolvedValue(undefined),
  }));
}

describe("adaptive session resume idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("A) fresh session start produces exactly one decision and persists it as pending", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const rows: Row[] = [];
    const events: Row[] = [];
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const result = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(result.action?.decisionTraceId).toBe("decision-1");
    expect(rows[0]?.pending_decision_trace_id).toBe("decision-1");
    expect(rows[0]?.pending_action).toMatchObject({ decisionTraceId: "decision-1" });
  });

  it("B) reload before answering does not call nextAction again and returns the same action", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const rows: Row[] = [];
    const events: Row[] = [];
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const first = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    const reload = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(reload.action?.decisionTraceId).toBe(first.action?.decisionTraceId);
    expect(reload.action).toEqual(first.action);
    expect(reload.session.id).toBe(first.session.id);
  });

  it("C) five reloads still produce only one decision and identical content", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const rows: Row[] = [];
    const events: Row[] = [];
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const first = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    for (let i = 0; i < 5; i += 1) {
      const reload = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
      expect(reload.action).toEqual(first.action);
    }

    expect(calls).toBe(1);
  });

  it("E) two concurrent fresh starts do not create two sessions or two decisions", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const { startSession } = await import("@/lib/adaptive/session-engine");
    const rows: Row[] = [];
    const events: Row[] = [];

    // Winner: no existing row yet, insert succeeds normally.
    const winnerService = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const winner = await startSession(winnerService as never, { userId: "u1", examPrepId: "p1" });

    // Loser: started concurrently, by the time its insert reaches the DB the
    // winner's row already exists (unique index violation, 23505). It must
    // fall back to reading the winner's row instead of minting a decision.
    const loserService = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") {
          return sessionsTableDouble(rows, { forceInsertConflictOnce: true });
        }
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const loser = await startSession(loserService as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(loser.session.id).toBe(winner.session.id);
    expect(loser.action).toEqual(winner.action);
    expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("F) a completed session is never resumed as if it still had a pending step", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    mockStudentStateNull();
    const rows: Row[] = [];
    const events: Row[] = [];
    const reviews: Row[] = [];
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        if (table === "adaptive_scheduled_reviews") return reviewsTableDouble(reviews);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { startSession, completeSession } = await import("@/lib/adaptive/session-engine");

    const started = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    await completeSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: started.session.id,
    });

    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.pending_action).toBeNull();

    // Starting again must not find the completed session as "active" and
    // must not resume its stale pending action — it starts a brand new one.
    const again = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(again.session.id).not.toBe(started.session.id);
    expect(calls).toBe(2);
  });

  it("D) submitEvidence persists a new pending action distinct from the one that was answered, and a retried submit does not mint another", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    vi.doMock("@/lib/adaptive/student-state", () => ({
      loadStudentState: vi.fn().mockResolvedValue({
        global: {
          examPrepId: "p1",
          examDate: null,
          targetScore: null,
          dailyMinutes: 45,
          studyDays: [1, 2, 3, 4, 5],
          planStartDate: null,
          planVersion: 1,
          daysRemaining: 30,
          progressPct: null,
          readinessPct: null,
          forecast: {},
          policyVersion: "adaptive-v1",
        },
        topics: [],
        graph: { topics: [] },
        behavior: {
          workedExampleSuccess: 0,
          retrievalSuccess: 0,
          averageHintDependency: 0,
          preferredEffectiveFormat: null,
          sessionCompletionRate: 0,
        },
      }),
      persistTopicMastery: vi.fn().mockResolvedValue(undefined),
    }));
    const rows: Row[] = [
      {
        id: "session-1",
        user_id: "u1",
        exam_prep_id: "p1",
        started_at: new Date().toISOString(),
        planned_duration_minutes: 45,
        objective: "",
        current_topic_id: null,
        current_topic_key: null,
        current_step: 0,
        completion_pct: 0,
        status: "active",
        pending_decision_trace_id: "decision-0",
        pending_action: makeAction(0),
      },
    ];
    const events: Row[] = [];
    const reviews: Row[] = [];
    const service = {
      from(table: string) {
        if (table === "adaptive_learning_sessions") return sessionsTableDouble(rows);
        if (table === "adaptive_learning_events") return eventsTableDouble(events);
        if (table === "adaptive_scheduled_reviews") return reviewsTableDouble(reviews);
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const { submitEvidence } = await import("@/lib/adaptive/session-engine");

    const evidence = {
      topicId: "topic-1",
      topicKey: "topluluk-dagilisi",
      correct: true,
      difficulty: "medium" as const,
      independent: true,
      hintUsed: false,
      retry: false,
      transfer: false,
      examLevel: false,
      retrievalAfterDelay: false,
      idempotencyKey: "answer-1",
    };

    const result = await submitEvidence(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: "session-1",
      evidence,
    });

    expect(calls).toBe(1);
    expect(result.action?.decisionTraceId).toBe("decision-1");
    expect(result.action?.decisionTraceId).not.toBe("decision-0");
    expect(rows[0]?.pending_decision_trace_id).toBe("decision-1");
    expect(rows[0]?.pending_action).toMatchObject({ decisionTraceId: "decision-1" });

    // Retried/duplicate submission of the SAME answer (same idempotencyKey)
    // must not mint another decision — it replays the pending action above.
    const retry = await submitEvidence(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: "session-1",
      evidence,
    });

    expect(calls).toBe(1);
    expect(retry.duplicate).toBe(true);
    expect(retry.action?.decisionTraceId).toBe("decision-1");
  });
});
