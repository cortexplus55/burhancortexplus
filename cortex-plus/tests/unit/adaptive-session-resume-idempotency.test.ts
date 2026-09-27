import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Production, 2026-09-27: one click on "Çalışmaya Başla" followed by one
 * page reload (zero new student input) produced two `openai_decision`
 * rows and two `intervention_started` events for the same topic at the
 * same timestamp — confirmed live via /admin/adaptive. Root cause:
 * startSession() called nextAction() unconditionally on every resume of an
 * existing active session, and nextAction() always mints a fresh
 * decisionTraceId, which the content cache (keyed by decisionTraceId) always
 * misses. Scenarios A-G pin the fix for the common (non-racing) resume path.
 *
 * A second, real gap surfaced in review: the unique index on
 * adaptive_learning_sessions stops two concurrent /session/start calls from
 * creating two SESSION rows, but does not by itself stop them from each
 * calling nextAction() for that session's first action if the loser reads
 * the winner's row before the winner has finished generating. The same gap
 * exists for two concurrent duplicate /session/evidence submissions.
 * Scenarios H and I reproduce the actual race window with a deferred-promise
 * barrier (not just two sequential calls) and pin the DB-backed
 * adaptive_generation_claims fix. Scenario J pins that a failed
 * pending-action write surfaces as an error instead of a silent success.
 */

type Row = Record<string, unknown>;

type SelectBuilder = {
  eq: (col: string, val: unknown) => SelectBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => SelectBuilder;
  limit: (n: number) => SelectBuilder;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (resolve: (v: { data: Row[]; error: null }) => void) => void;
};

/** Generic fake Postgrest-style select builder shared by every fake table. */
function makeQueryBuilder(rows: Row[]): SelectBuilder {
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
  const builder: SelectBuilder = {
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

type UpdateBuilder = {
  eq: (col: string, val: unknown) => UpdateBuilder;
  is: (col: string, val: unknown) => UpdateBuilder;
  select: () => { maybeSingle: () => Promise<{ data: Row | null; error: null }> };
  then: (resolve: (v: { data: null; error: null }) => void) => void;
};

/** Generic fake update builder: supports plain `await` and `.select().maybeSingle()` (compare-and-swap read-back). */
function makeUpdateBuilder(rows: Row[], patch: Row, forcedError: { message: string; code?: string } | null = null): UpdateBuilder {
  const filters: [string, unknown][] = [];
  const matches = (r: Row) => filters.every(([c, v]) => r[c] === v);
  const builder: UpdateBuilder = {
    eq(col, val) {
      filters.push([col, val]);
      return builder;
    },
    is(col, val) {
      filters.push([col, val]);
      return builder;
    },
    select() {
      return {
        async maybeSingle() {
          if (forcedError) return { data: null, error: forcedError as never };
          const target = rows.find(matches);
          if (!target) return { data: null, error: null };
          Object.assign(target, patch);
          return { data: { ...target }, error: null };
        },
      };
    },
    then(resolve) {
      if (forcedError) {
        resolve({ data: null, error: forcedError as never });
        return;
      }
      const target = rows.find(matches);
      if (target) Object.assign(target, patch);
      resolve({ data: null, error: null });
    },
  };
  return builder;
}

function sessionsTableDouble(
  rows: Row[],
  opts: {
    forceUpdateError?: { message: string };
    /**
     * Simulates a concurrent winner's row committing in the gap between our
     * own getActiveSession() (which found nothing) and our insert: the row
     * appears in `rows` (as that winner's insert would really do) at the
     * exact moment our insert runs, which then correctly conflicts.
     */
    injectConcurrentWinnerOnInsert?: Row;
  } = {},
) {
  let idCounter = rows.length;
  let injectPending = opts.injectConcurrentWinnerOnInsert ?? null;
  return {
    select() {
      return makeQueryBuilder(rows);
    },
    insert(row: Row) {
      if (injectPending) {
        rows.push(injectPending);
        injectPending = null;
        return {
          select: () => ({
            single: async () => ({ data: null, error: { code: "23505", message: "duplicate key value" } }),
          }),
        };
      }
      // Real uniqueness check mirroring the production unique partial index:
      // at most one 'active' row per (user_id, exam_prep_id).
      const conflict = rows.some(
        (r) => r.user_id === row.user_id && r.exam_prep_id === row.exam_prep_id && r.status === "active",
      );
      if (conflict) {
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
      return makeUpdateBuilder(rows, patch, opts.forceUpdateError ?? null);
    },
  };
}

function eventsTableDouble(events: Row[]) {
  return {
    select() {
      return makeQueryBuilder(events);
    },
    insert: async (row: Row) => {
      // Real uniqueness check mirroring adaptive_learning_events_idem_idx
      // ON (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL —
      // enforced at insert time regardless of what an earlier read saw, so
      // two truly concurrent submitEvidence calls resolve correctly however
      // their pre-checks interleave.
      if (row.idempotency_key != null) {
        const conflict = events.some(
          (e) => e.user_id === row.user_id && e.idempotency_key === row.idempotency_key,
        );
        if (conflict) {
          return { error: { code: "23505", message: "duplicate key value" } };
        }
      }
      events.push({ id: `evt-${events.length + 1}`, ...row });
      return { error: null };
    },
  };
}

function claimsTableDouble(claims: Row[]) {
  return {
    select() {
      return makeQueryBuilder(claims);
    },
    insert: async (row: Row) => {
      const conflict = claims.some((c) => c.session_id === row.session_id && c.token === row.token);
      if (conflict) return { error: { code: "23505", message: "duplicate key value" } };
      claims.push({ decision_trace_id: null, action: null, ...row });
      return { error: null };
    },
    update(patch: Row) {
      return makeUpdateBuilder(claims, patch);
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

type Tables = {
  sessions: Row[];
  events: Row[];
  claims: Row[];
  reviews?: Row[];
  sessionsOpts?: { forceUpdateError?: { message: string }; injectConcurrentWinnerOnInsert?: Row };
};

function buildService(tables: Tables) {
  return {
    from(table: string) {
      if (table === "adaptive_learning_sessions") return sessionsTableDouble(tables.sessions, tables.sessionsOpts);
      if (table === "adaptive_learning_events") return eventsTableDouble(tables.events);
      if (table === "adaptive_generation_claims") return claimsTableDouble(tables.claims);
      if (table === "adaptive_scheduled_reviews") return reviewsTableDouble(tables.reviews ?? []);
      throw new Error(`unexpected table: ${table}`);
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

/** Flush pending microtasks up to `max` times, or until `until()` is true. */
async function flushUntil(until: () => boolean, max = 50): Promise<void> {
  for (let i = 0; i < max && !until(); i += 1) {
    await Promise.resolve();
  }
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
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const result = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(result.action?.decisionTraceId).toBe("decision-1");
    expect(tables.sessions[0]?.pending_decision_trace_id).toBe("decision-1");
    expect(tables.sessions[0]?.pending_action).toMatchObject({ decisionTraceId: "decision-1" });
    expect(tables.claims).toHaveLength(1);
    expect(tables.claims[0]).toMatchObject({ token: "start", decision_trace_id: "decision-1" });
  });

  it("B) reload before answering does not call nextAction again and returns the same action", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);
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
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);
    const { startSession } = await import("@/lib/adaptive/session-engine");

    const first = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    for (let i = 0; i < 5; i += 1) {
      const reload = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
      expect(reload.action).toEqual(first.action);
    }

    expect(calls).toBe(1);
  });

  it("E) two sequential fresh starts (simple case) resolve to the same session and decision", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const { startSession } = await import("@/lib/adaptive/session-engine");
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);

    const winner = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    // A second start attempt against the SAME (now-populated) tables — the
    // insert sees the winner's row and conflicts for real (not a forced
    // flag), exactly like the unique index would in production.
    const loser = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(loser.session.id).toBe(winner.session.id);
    expect(loser.action).toEqual(winner.action);
    expect(tables.sessions.filter((r) => r.status === "active")).toHaveLength(1);
    // The true concurrent race (loser reads the winner's row BEFORE the
    // winner has finished generating) is scenario H, using a real barrier.
  });

  it("E2) the 23505 insert-race branch resumes via the exact same helper as a plain existing session", async () => {
    // Simulates: our own getActiveSession() found nothing (rows starts
    // empty), but a concurrent request's insert fully commits in the gap
    // before ours runs — a normal read-then-insert race under READ
    // COMMITTED, not an artificial one.
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    const { startSession } = await import("@/lib/adaptive/session-engine");
    const tables: Tables = {
      sessions: [],
      events: [],
      claims: [],
      sessionsOpts: {
        injectConcurrentWinnerOnInsert: {
          id: "session-concurrent-winner",
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
          pending_decision_trace_id: null,
          pending_action: null,
        },
      },
    };
    const service = buildService(tables);

    const result = await startSession(service as never, { userId: "u1", examPrepId: "p1" });

    expect(calls).toBe(1);
    expect(result.session.id).toBe("session-concurrent-winner");
    expect(result.action?.decisionTraceId).toBe("decision-1");
    expect(tables.sessions).toHaveLength(1); // no second row inserted
  });

  it("F) a completed session is never resumed as if it still had a pending step", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    mockStudentStateNull();
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);
    const { startSession, completeSession } = await import("@/lib/adaptive/session-engine");

    const started = await startSession(service as never, { userId: "u1", examPrepId: "p1" });
    await completeSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: started.session.id,
    });

    expect(tables.sessions[0]?.status).toBe("completed");
    expect(tables.sessions[0]?.pending_action).toBeNull();

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
    const tables: Tables = {
      sessions: [
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
      ],
      events: [],
      claims: [],
      reviews: [],
    };
    const service = buildService(tables);
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
    expect(tables.sessions[0]?.pending_decision_trace_id).toBe("decision-1");
    expect(tables.sessions[0]?.pending_action).toMatchObject({ decisionTraceId: "decision-1" });

    // Retried/duplicate submission of the SAME answer (same idempotencyKey)
    // must not mint another decision — it joins/replays the pending action
    // established above.
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

  it("G) submitEvidence against a completed session is a no-op (terminal-state guard)", async () => {
    let calls = 0;
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => makeAction(++calls)),
    }));
    mockStudentStateNull();
    const tables: Tables = {
      sessions: [
        {
          id: "session-1",
          user_id: "u1",
          exam_prep_id: "p1",
          started_at: new Date().toISOString(),
          planned_duration_minutes: 45,
          objective: "",
          current_topic_id: null,
          current_topic_key: null,
          current_step: 3,
          completion_pct: 100,
          // Already completed — e.g. the student finished, and a stale/late
          // client request (double-submit race, retried network call) then
          // arrives for the same sessionId.
          status: "completed",
          pending_decision_trace_id: null,
          pending_action: null,
        },
      ],
      events: [],
      claims: [],
    };
    const service = buildService(tables);
    const { submitEvidence } = await import("@/lib/adaptive/session-engine");

    const result = await submitEvidence(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: "session-1",
      evidence: {
        topicId: "topic-1",
        topicKey: "topluluk-dagilisi",
        correct: true,
        difficulty: "medium",
        independent: true,
        hintUsed: false,
        retry: false,
        transfer: false,
        examLevel: false,
        retrievalAfterDelay: false,
        idempotencyKey: "late-answer-1",
      },
    });

    expect(calls).toBe(0);
    expect(result.action).toBeNull();
    expect(tables.events).toHaveLength(0);
    expect(tables.claims).toHaveLength(0);
    expect(tables.sessions[0]?.status).toBe("completed");
    expect(tables.sessions[0]?.pending_action).toBeNull();
    expect(tables.sessions[0]?.current_step).toBe(3);
  });

  it("H) true concurrent start race: only the claim-winner calls nextAction, the loser joins", async () => {
    const nextActionCalls: number[] = [];
    let releaseWinner: (() => void) | null = null;
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => {
        nextActionCalls.push(nextActionCalls.length + 1);
        await winnerGate;
        return makeAction(nextActionCalls.length);
      }),
    }));
    const { startSession } = await import("@/lib/adaptive/session-engine");
    const tables: Tables = { sessions: [], events: [], claims: [] };
    const service = buildService(tables);

    // Start the "winner" request. It runs: no existing session -> insert
    // succeeds -> session_started event -> claims token "start" (wins,
    // inserts the claim row) -> calls nextAction() -> blocks on winnerGate.
    const winnerPromise = startSession(service as never, { userId: "u1", examPrepId: "p1" });
    await flushUntil(() => nextActionCalls.length === 1);
    expect(nextActionCalls).toHaveLength(1);
    // At this exact point: the session row exists, a claim row for "start"
    // exists, but pending_action is still null — this is the real race
    // window the review flagged.
    expect(tables.sessions).toHaveLength(1);
    expect(tables.claims).toHaveLength(1);
    expect(tables.sessions[0]?.pending_action).toBeNull();

    // NOW start the "loser" request against that exact state.
    const loserPromise = startSession(service as never, { userId: "u1", examPrepId: "p1" });
    await flushUntil(() => false, 10); // let it run as far as it can without a real timer tick
    expect(nextActionCalls).toHaveLength(1); // loser must not have called nextAction

    releaseWinner!();
    const winner = await winnerPromise;
    const loser = await loserPromise;

    expect(nextActionCalls).toHaveLength(1);
    expect(tables.sessions.filter((r) => r.status === "active")).toHaveLength(1);
    expect(tables.claims.filter((c) => c.token === "start")).toHaveLength(1);
    expect(loser.session.id).toBe(winner.session.id);
    expect(loser.action?.decisionTraceId).toBe(winner.action?.decisionTraceId);
    expect(loser.action).toEqual(winner.action);
  });

  it("I) true concurrent duplicate evidence submit: the loser never generates and never replays the pre-answer action", async () => {
    const nextActionCalls: number[] = [];
    let releaseWinner: (() => void) | null = null;
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockImplementation(async () => {
        nextActionCalls.push(nextActionCalls.length + 1);
        await winnerGate;
        return makeAction(nextActionCalls.length + 1); // decision-2 (after decision-1/decision-0 pre-answer)
      }),
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
    const tables: Tables = {
      sessions: [
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
      ],
      events: [],
      claims: [],
      reviews: [],
    };
    const service = buildService(tables);
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

    // Request A submits first — it wins the answer_submitted event insert,
    // processes mastery, claims token "answer-1", calls nextAction(), and
    // blocks.
    const aPromise = submitEvidence(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: "session-1",
      evidence,
    });
    await flushUntil(() => nextActionCalls.length === 1);
    expect(nextActionCalls).toHaveLength(1);
    // A has already won the event insert and the claim; the session row
    // still shows the OLD (about-to-be-superseded) pending action.
    expect(tables.events.some((e) => e.idempotency_key === "answer-1")).toBe(true);
    expect(tables.sessions[0]?.pending_decision_trace_id).toBe("decision-0");

    // Request B submits the exact same answer (same idempotencyKey) while A
    // is still mid-generation. It must see the duplicate event, and must
    // NEVER call nextAction() nor return the stale decision-0 as if it were
    // the answer to this submission.
    const bPromise = submitEvidence(service as never, {
      userId: "u1",
      examPrepId: "p1",
      sessionId: "session-1",
      evidence,
    });
    await flushUntil(() => false, 10);
    expect(nextActionCalls).toHaveLength(1); // B did not generate

    releaseWinner!();
    const aResult = await aPromise;
    const bResult = await bPromise;

    expect(nextActionCalls).toHaveLength(1);
    expect(aResult.duplicate).toBe(false);
    expect(bResult.duplicate).toBe(true);
    expect(aResult.action?.decisionTraceId).not.toBe("decision-0");
    expect(bResult.action?.decisionTraceId).not.toBe("decision-0");
    expect(bResult.action?.decisionTraceId).toBe(aResult.action?.decisionTraceId);
    expect(tables.sessions[0]?.pending_decision_trace_id).toBe(aResult.action?.decisionTraceId);
  });

  it("J) a failed pending-action write surfaces as an error, not a silent success", async () => {
    vi.doMock("@/lib/adaptive/learning-governor", () => ({
      nextAction: vi.fn().mockResolvedValue(makeAction(1)),
    }));
    const tables: Tables = {
      sessions: [],
      events: [],
      claims: [],
      sessionsOpts: { forceUpdateError: { message: "connection reset" } },
    };
    const service = buildService(tables);
    const { startSession } = await import("@/lib/adaptive/session-engine");

    await expect(
      startSession(service as never, { userId: "u1", examPrepId: "p1" }),
    ).rejects.toThrow("connection reset");

    // The decision was generated and even recorded on the claim row (that
    // part of the DB write succeeded), but the client-facing call must not
    // resolve as if the session's own pending state were durably saved.
    expect(tables.claims[0]?.decision_trace_id).toBe("decision-1");
    expect(tables.sessions[0]?.pending_decision_trace_id).toBeNull();
  });
});
