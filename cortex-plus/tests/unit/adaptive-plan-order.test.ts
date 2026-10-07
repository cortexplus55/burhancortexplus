import { describe, expect, it, vi } from "vitest";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { TopicMasteryState } from "@/lib/adaptive/types";
import { buildDailyPlanItems } from "@/lib/adaptive/daily-planner";
import { hasUndelimitedLatex } from "@/lib/learning/teaching-standards";

function graph(topics: { key: string; title: string; importance?: "important" | "medium" | "less" }[]): ExamGraph {
  return {
    examPrepId: "00000000-0000-4000-8000-000000000099",
    topics: topics.map((t, i) => ({
      topicId: `id-${i}`,
      topicKey: t.key,
      title: t.title,
      importance: t.importance ?? "medium",
      weightPercent: t.importance === "important" ? 20 : 10,
      prerequisites: [],
      sourceRefs: [],
      pageNumbers: [],
      documentTopicNodeId: null,
      measuredLevel: null,
    })),
    edges: [],
  };
}

function mastery(key: string, mastery: number): TopicMasteryState {
  return {
    topicId: `id-${key}`,
    topicKey: key,
    mastery,
    masteryConfidence: 0.5,
    evidenceCount: 2,
    recentAccuracy: null,
    independentAccuracy: null,
    examLevelAccuracy: null,
    currentDifficulty: "medium",
    lastStudiedAt: null,
    lastAssessedAt: null,
    reviewDueAt: null,
    streakCorrect: 0,
    repeatedErrorCount: 0,
    misconceptionFlags: [],
    prerequisiteRisk: false,
    status: mastery >= 0.85 ? "mastered" : "learning",
  };
}

describe("planTopicKeys oturum sırası", () => {
  it("planTopicKeys verilen konuları öne alır", () => {
    const g = graph([
      { key: "birim-cember", title: "Birim Çember", importance: "important" },
      { key: "aci-olcusu", title: "Açı Ölçüsü ve Radyan" },
    ]);
    const ranked = prioritizeTopics({
      graph: g,
      topics: [mastery("birim-cember", 0.2), mastery("aci-olcusu", 0.4)],
      planTopicKeys: ["aci-olcusu"],
      daysRemaining: 13,
    });
    expect(ranked[0]?.topicKey).toBe("aci-olcusu");
    expect(ranked[0]?.reason).toBe("plan");
  });

  it("buildDailyPlanItems öğrenme maddesini önce koyar", () => {
    const built = buildDailyPlanItems({
      userId: "u",
      examPrepId: "00000000-0000-4000-8000-000000000001",
      schedule: {
        sessions: [
          {
            calendarDate: "2099-01-01",
            topicTitle: "Açı Ölçüsü ve Radyan",
            topicId: "t1",
            role: "learn",
            durationMinutes: 20,
          },
          {
            calendarDate: "2099-01-01",
            topicTitle: "Birim Çember",
            topicId: "t2",
            role: "learn",
            durationMinutes: 20,
          },
        ],
      } as never,
      reviewItems: [],
      weakTopics: [],
      dailyMinutesCap: 90,
      masterPlanVersion: 1,
      planDate: "2099-01-01",
    });
    expect(built.items[0]?.title).toMatch(/Açı Ölçüsü/);
    expect(built.items[0]?.href).toContain("/oturum");
    expect(built.items[1]?.title).toMatch(/Birim Çember/);
  });
});

type TeachAction = {
  action: "teach";
  topicId: string;
  topicKey: string;
  teachingMode: "explanation";
  difficulty: "medium";
  model: string;
  durationTarget: number;
  sourceRefs: unknown[];
  reasonCode: string;
  reasonCopy: string;
  decisionTraceId: string;
};

function teachAction(topicKey: string, decisionTraceId: string): TeachAction {
  return {
    action: "teach",
    topicId: `id-${topicKey}`,
    topicKey,
    teachingMode: "explanation",
    difficulty: "medium",
    model: "gpt-4o-mini",
    durationTarget: 20,
    sourceRefs: [],
    reasonCode: "PLAN_OBJECTIVE",
    reasonCopy: "",
    decisionTraceId,
  };
}

/** Lightweight inline fake — full resume suite lives elsewhere. */
async function withPlanSessionFake(opts: {
  planItems: {
    id: string;
    topic_key: string;
    status: string;
    sort_order: number;
    title?: string;
  }[];
  pending: TeachAction | null;
  events?: Record<string, unknown>[];
  claims?: Record<string, unknown>[];
}) {
  vi.resetModules();
  const sessions: Record<string, unknown>[] = [
    {
      id: "sess-1",
      user_id: "u1",
      exam_prep_id: "p1",
      started_at: new Date().toISOString(),
      planned_duration_minutes: 45,
      objective: "Bugünkü çalışma",
      current_topic_id: null,
      current_step: 0,
      completion_pct: 0,
      status: "active",
      pending_decision_trace_id: opts.pending?.decisionTraceId ?? null,
      pending_action: opts.pending,
    },
  ];
  const plans = [
    { id: "plan-1", user_id: "u1", exam_prep_id: "p1", status: "active", plan_date: "2099-01-01", objective: "Bugün" },
  ];
  const planItems = opts.planItems.map((item) => ({
    daily_plan_id: "plan-1",
    kind: "learn",
    title: item.title ?? `${item.topic_key} — öğrenme`,
    ...item,
  }));
  const claims: Record<string, unknown>[] = [...(opts.claims ?? [])];
  const events: Record<string, unknown>[] = [...(opts.events ?? [])];
  let nextCalls = 0;

  vi.doMock("@/lib/adaptive/learning-governor", () => ({
    nextAction: vi.fn().mockImplementation(async (
      _s: unknown,
      _u: string,
      _p: string,
      _sid: string,
      ctx: { planItem?: { topicKey: string } } = {},
    ) => {
      nextCalls += 1;
      const key = ctx.planItem?.topicKey ?? "aci-olcusu";
      return teachAction(key, `decision-new-${nextCalls}`);
    }),
  }));
  vi.doMock("@/lib/adaptive/student-state", () => ({
    loadStudentState: vi.fn().mockResolvedValue(null),
    persistTopicMastery: vi.fn(),
  }));

  function qb(rows: Record<string, unknown>[]) {
    const filters: [string, unknown, string?][] = [];
    let orderCol: string | null = null;
    let asc = true;
    let lim: number | null = null;
    const filtered = () => {
      let out = rows.filter((r) =>
        filters.every(([c, v, op]) => {
          if (op === "like") {
            const pat = String(v).replace(/%/g, ".*");
            return new RegExp(`^${pat}$`).test(String(r[c] ?? ""));
          }
          return r[c] === v;
        }),
      );
      if (orderCol) {
        out = [...out].sort((a, b) => {
          const av = a[orderCol!];
          const bv = b[orderCol!];
          return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
      }
      if (lim != null) out = out.slice(0, lim);
      return out;
    };
    const builder: Record<string, unknown> = {
      eq(c: string, v: unknown) {
        filters.push([c, v]);
        return builder;
      },
      like(c: string, v: unknown) {
        filters.push([c, v, "like"]);
        return builder;
      },
      order(c: string, opts?: { ascending?: boolean }) {
        orderCol = c;
        asc = opts?.ascending !== false;
        return builder;
      },
      limit(n: number) {
        lim = n;
        return builder;
      },
      async maybeSingle() {
        return { data: filtered()[0] ?? null, error: null };
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: filtered(), error: null });
      },
    };
    return builder;
  }

  const service = {
    from(table: string) {
      if (table === "adaptive_learning_sessions") {
        return {
          select: () => qb(sessions),
          update(patch: Record<string, unknown>) {
            const filters: [string, unknown][] = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push([c, v]);
                return b;
              },
              then(resolve: (v: { data: null; error: null }) => void) {
                for (const row of sessions) {
                  if (filters.every(([c, v]) => row[c] === v)) Object.assign(row, patch);
                }
                resolve({ data: null, error: null });
              },
            };
            return b;
          },
          insert() {
            throw new Error("should not insert");
          },
        };
      }
      if (table === "adaptive_daily_plans") return { select: () => qb(plans) };
      if (table === "adaptive_daily_plan_items") {
        return {
          select: () => qb(planItems),
          update() {
            return {
              eq() {
                return {
                  then(resolve: (v: { data: null; error: null }) => void) {
                    resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "adaptive_generation_claims") {
        return {
          select: () => qb(claims),
          insert: async (row: Record<string, unknown>) => {
            claims.push({ decision_trace_id: null, action: null, ...row });
            return { error: null };
          },
          update(patch: Record<string, unknown>) {
            const filters: [string, unknown][] = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push([c, v]);
                return b;
              },
              then(resolve: (v: { data: null; error: null }) => void) {
                for (const row of claims) {
                  if (filters.every(([c, v]) => row[c] === v)) Object.assign(row, patch);
                }
                resolve({ data: null, error: null });
              },
            };
            return b;
          },
        };
      }
      if (table === "adaptive_learning_events") {
        return {
          select: () => qb(events),
          insert: async (row: Record<string, unknown>) => {
            events.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  const { startSession } = await import("@/lib/adaptive/session-engine");
  return {
    startSession,
    service,
    sessions,
    claims,
    events,
    get nextCalls() {
      return nextCalls;
    },
  };
}

describe("startSession plan maddesi sırası (B3)", () => {
  const defaultItems = [
    {
      id: "item-1",
      topic_key: "aci-olcusu",
      status: "pending",
      sort_order: 0,
      title: "Açı Ölçüsü — öğrenme",
    },
    {
      id: "item-2",
      topic_key: "birim-cember",
      status: "pending",
      sort_order: 1,
      title: "Birim Çember — öğrenme",
    },
  ];

  it("c) idle pending başka konuda + planItemId=item-1 → item-1 konusu", async () => {
    const { startSession, service, sessions } = await withPlanSessionFake({
      planItems: defaultItems,
      pending: teachAction("birim-cember", "decision-old"),
      // idle: no intervention_started / content event
      events: [],
    });

    const first = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-1",
    });
    expect(first.action?.topicKey).toBe("aci-olcusu");
    expect(first.action?.decisionTraceId).not.toBe("decision-old");

    // planItemId item-2 + idle pending Açı → Birim Çember
    sessions[0]!.pending_decision_trace_id = "decision-stale";
    sessions[0]!.pending_action = teachAction("aci-olcusu", "decision-stale");
    const second = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-2",
    });
    expect(second.action?.topicKey).toBe("birim-cember");
  });

  it("a) done planItemId + served unanswered → d-a2; bayat start:item-1 claim yok sayılır", async () => {
    const dA2 = teachAction("birim-cember", "d-a2");
    const dA1 = teachAction("aci-olcusu", "d-a1");
    const { startSession, service, sessions } = await withPlanSessionFake({
      planItems: [
        { id: "item-1", topic_key: "aci-olcusu", status: "done", sort_order: 0 },
        { id: "item-2", topic_key: "birim-cember", status: "pending", sort_order: 1 },
      ],
      pending: dA2,
      events: [
        {
          id: "ev-serve-a2",
          session_id: "sess-1",
          event_type: "intervention_started",
          idempotency_key: "content:sess-1:d-a2",
          payload: { content: { decisionTraceId: "d-a2" } },
          created_at: "2099-01-01T12:00:00Z",
        },
        {
          id: "ev-answer-a1",
          session_id: "sess-1",
          event_type: "answer_submitted",
          idempotency_key: "sess-1:d-a1:1",
          payload: { evidence: { idempotencyKey: "sess-1:d-a1:1", decisionTraceId: "d-a1" } },
          created_at: "2099-01-01T11:00:00Z",
        },
      ],
      claims: [
        {
          session_id: "sess-1",
          token: "start:item-1",
          decision_trace_id: "d-a1",
          action: dA1,
          claimed_at: "2099-01-01T10:00:00Z",
        },
      ],
    });

    const result = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-1",
    });
    expect(result.action?.decisionTraceId).toBe("d-a2");
    expect(result.action?.topicKey).toBe("birim-cember");
    expect(sessions[0]!.pending_decision_trace_id).toBe("d-a2");
  });

  it("b) CTA (planItemId yok) + served unanswered başka konuda → o soru sürer", async () => {
    const pending = teachAction("birim-cember", "d-served");
    const { startSession, service, sessions } = await withPlanSessionFake({
      planItems: defaultItems,
      pending,
      events: [
        {
          id: "ev-1",
          session_id: "sess-1",
          event_type: "intervention_started",
          idempotency_key: "content:sess-1:d-served",
          payload: { content: { decisionTraceId: "d-served" } },
          created_at: "2099-01-01T12:00:00Z",
        },
      ],
    });

    const result = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
    });
    expect(result.action?.decisionTraceId).toBe("d-served");
    expect(result.action?.topicKey).toBe("birim-cember");
    expect(sessions[0]!.pending_decision_trace_id).toBe("d-served");
  });

  it("d) planItemId=item-2 iken item-1 konusunda served unanswered → önce o soru", async () => {
    const pending = teachAction("aci-olcusu", "d-item1-served");
    const { startSession, service, sessions } = await withPlanSessionFake({
      planItems: defaultItems,
      pending,
      events: [
        {
          id: "ev-1",
          session_id: "sess-1",
          event_type: "intervention_started",
          idempotency_key: "content:sess-1:d-item1-served",
          payload: { content: { decisionTraceId: "d-item1-served" } },
          created_at: "2099-01-01T12:00:00Z",
        },
      ],
    });

    const result = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-2",
    });
    expect(result.action?.decisionTraceId).toBe("d-item1-served");
    expect(result.action?.topicKey).toBe("aci-olcusu");
    expect(sessions[0]!.pending_decision_trace_id).toBe("d-item1-served");
  });
});

describe("hasUndelimitedLatex", () => {
  it("$…$ içindeki LaTeX'i engellemez", () => {
    expect(hasUndelimitedLatex("$\\alpha_{\\text{rad}}$")).toBe(false);
    expect(hasUndelimitedLatex("\\frac{1}{2}")).toBe(true);
  });
});
