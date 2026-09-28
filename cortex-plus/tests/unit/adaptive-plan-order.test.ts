import { describe, expect, it, vi } from "vitest";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { TopicMasteryState } from "@/lib/adaptive/types";
import { buildDailyPlanItems } from "@/lib/adaptive/daily-planner";
import { minimumLessonChecks, ensureThreeChecks } from "@/lib/learning/lesson-repair";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
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

describe("startSession plan maddesi sırası (B3)", () => {
  it("idle aktif oturum plan maddesini ezmez; planItemId madde 2'yi açar", async () => {
    vi.resetModules();
    // Lightweight inline fake — full resume suite lives elsewhere.
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
        pending_decision_trace_id: "decision-old",
        pending_action: {
          action: "teach",
          topicId: "t-birim",
          topicKey: "birim-cember",
          teachingMode: "explanation",
          difficulty: "medium",
          model: "gpt-4o-mini",
          durationTarget: 20,
          sourceRefs: [],
          reasonCode: "PLAN_OBJECTIVE",
          reasonCopy: "",
          decisionTraceId: "decision-old",
        },
      },
    ];
    const plans = [
      { id: "plan-1", user_id: "u1", exam_prep_id: "p1", status: "active", plan_date: "2099-01-01", objective: "Bugün: Açı" },
    ];
    const planItems = [
      {
        id: "item-1",
        daily_plan_id: "plan-1",
        kind: "learn",
        title: "Açı Ölçüsü — öğrenme",
        topic_key: "aci-olcusu",
        status: "pending",
        sort_order: 0,
      },
      {
        id: "item-2",
        daily_plan_id: "plan-1",
        kind: "learn",
        title: "Birim Çember — öğrenme",
        topic_key: "birim-cember",
        status: "pending",
        sort_order: 1,
      },
    ];
    const claims: Record<string, unknown>[] = [];
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
        return {
          action: "teach",
          topicId: `id-${key}`,
          topicKey: key,
          teachingMode: "explanation",
          difficulty: "medium",
          model: "gpt-4o-mini",
          durationTarget: 20,
          sourceRefs: [],
          reasonCode: "PLAN_OBJECTIVE",
          reasonCopy: "",
          decisionTraceId: `decision-new-${nextCalls}`,
        };
      }),
    }));
    vi.doMock("@/lib/adaptive/student-state", () => ({
      loadStudentState: vi.fn().mockResolvedValue(null),
      persistTopicMastery: vi.fn(),
    }));

    function qb(rows: Record<string, unknown>[]) {
      const filters: [string, unknown][] = [];
      let orderCol: string | null = null;
      let asc = true;
      let lim: number | null = null;
      const filtered = () => {
        let out = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
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
            select: () => qb([]),
            insert: async () => ({ error: null }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };

    const { startSession } = await import("@/lib/adaptive/session-engine");

    // Idle pending Birim Çember + CTA (item 1 Açı) → Açı üretilir
    const first = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-1",
    });
    expect(first.action?.topicKey).toBe("aci-olcusu");
    expect(first.action?.decisionTraceId).not.toBe("decision-old");

    // planItemId item-2 → Birim Çember
    sessions[0]!.pending_decision_trace_id = "decision-stale";
    sessions[0]!.pending_action = {
      action: "teach",
      topicId: "t-aci",
      topicKey: "aci-olcusu",
      teachingMode: "explanation",
      difficulty: "medium",
      model: "gpt-4o-mini",
      durationTarget: 20,
      sourceRefs: [],
      reasonCode: "PLAN_OBJECTIVE",
      reasonCopy: "",
      decisionTraceId: "decision-stale",
    };
    const second = await startSession(service as never, {
      userId: "u1",
      examPrepId: "p1",
      planItemId: "item-2",
    });
    expect(second.action?.topicKey).toBe("birim-cember");
  });
});

describe("check count refill", () => {
  it("4 bölüm 1 kontrollü taslak ensureThreeChecks sonrası ≥3 kontrol olur", () => {
    const draft: LessonV2 = {
      title: "Trigonometri",
      overview: "Açı ölçüsü radyan ve derece ile yazılır. Dönüşüm π/180 çarpanını kullanır.",
      sections: [
        {
          heading: "Radyan",
          body: "Bir radyan, yarıçap uzunluğundaki yayının merkeze göre gördüğü açıdır. 2π radyan tam turdur.",
        },
        {
          heading: "Derece",
          body: "Tam tur 360 derecedir. 180 derece π radyana eşittir. Dönüşüm α_r = α_d × π ÷ 180 bağıntısıyla yapılır.",
        },
        {
          heading: "Dönüşüm",
          body: "Dereceden radyana geçerken açı π ile çarpılıp 180'e bölünür. Tersi için 180/π kullanılır.",
          check: {
            type: "mcq",
            prompt: "360 derece kaç radyandır?",
            options: ["2π", "π", "π/2", "4π"],
            answerIndex: 0,
            explanation: "Tam tur 2π radyandır.",
          },
        },
        {
          heading: "Birim çember",
          body: "Birim çember yarıçapı 1 olan çemberdir. Koordinatlar (cos θ, sin θ) olarak okunur.",
        },
      ],
      summary: ["2π = 360°", "π = 180°", "Dönüşüm çarpanı"],
    };
    expect(minimumLessonChecks(draft)).toBeGreaterThanOrEqual(3);
    const filled = ensureThreeChecks(draft, draft.sections.map((s) => s.body).join("\n"));
    const checks = filled.sections.filter((s) => s.check).length;
    expect(checks).toBeGreaterThanOrEqual(3);
  });
});

describe("hasUndelimitedLatex", () => {
  it("$…$ içindeki LaTeX'i engellemez", () => {
    expect(hasUndelimitedLatex("$\\alpha_{\\text{rad}}$")).toBe(false);
    expect(hasUndelimitedLatex("\\frac{1}{2}")).toBe(true);
  });
});
