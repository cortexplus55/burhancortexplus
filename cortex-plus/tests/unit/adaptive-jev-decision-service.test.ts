import { beforeEach, describe, expect, it, vi } from "vitest";
import { jevCircuitReset } from "@/lib/adaptive/jev/circuit-breaker";
import type { CompactDecisionState } from "@/lib/adaptive/types";

function baseState(
  allowed: CompactDecisionState["allowed_actions"] = [
    "practice",
    "reteach",
    "teach",
  ],
): CompactDecisionState {
  return {
    student: {
      exam_days_remaining: 12,
      session_minutes_remaining: 25,
      fatigue_signal: 0.2,
    },
    objective: {
      topic_id: "t1",
      mastery: 0.45,
      mastery_confidence: 0.5,
      recent_accuracy: 0.5,
      attempt_count: 3,
    },
    evidence: {
      last_answer_correct: false,
      hint_count: 0,
      repeated_misconception: false,
      prerequisite_status: "met",
    },
    plan: { today_target: "Synthetic", behind_schedule: false },
    allowed_actions: allowed,
  };
}

function mockService(inserts: unknown[]) {
  return {
    from: () => ({
      insert: async (row: unknown) => {
        inserts.push(row);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "audit-1" }, error: null }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };
}

const jevSuccessResult = {
  provider: "jev" as const,
  action: "practice" as const,
  teachingMode: "step_by_step" as const,
  difficulty: "medium" as const,
  needsPrerequisiteReview: false,
  readyToAdvance: false,
  needsGpt4o: false,
  needsDailyReplan: false,
  misconceptionSeverity: 0,
  modelRecommendation: "gpt-4o-mini" as const,
  confidence: 0.8,
  probabilities: { "next_action.practice": 0.8 },
  latencyMs: 90,
  fallbackReason: null,
  telemetry: {
    model: "jev-1.13.0",
    inputTokens: 500,
    outputTokens: 20,
    estimatedCostUsd: 0.000021,
    escalated: false,
    escalationReason: null,
  },
  jevUsage: {
    access: "typesafe" as const,
    model: "jev-1.13.0",
    latencyMs: 90,
    attempts: 1,
    inputTokens: 500,
    outputTokens: 20,
    costUsd: 0.000021,
    confidence: 0.8,
    questionSetVersion: 1,
  },
};

describe("decideNextActions Jev paths", () => {
  beforeEach(() => {
    jevCircuitReset();
    vi.resetModules();
  });

  async function setup(opts: {
    jevEnabled?: boolean;
    shadow?: boolean;
    decisionProvider?: string;
    flag?: boolean;
    jevDecide?: () => Promise<unknown>;
    openaiDecide?: () => Promise<unknown>;
    hasTypesafe?: boolean;
  }) {
    const afterCalls: Array<() => void> = [];
    vi.doMock("next/server", () => ({
      after: (fn: () => void) => {
        afterCalls.push(fn);
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        TYPESAFE_API_KEY: opts.hasTypesafe === false ? undefined : "test-key",
        AI_GATEWAY_API_KEY: undefined,
        JEV_ACCESS: "typesafe",
        JEV_BASE_URL: undefined,
        JEV_MODEL: "jev-1.13.0",
        JEV_ENABLED: opts.jevEnabled ?? true,
        JEV_SHADOW_MODE: opts.shadow ?? false,
        JEV_TIMEOUT_MS: 2000,
        JEV_MIN_CONFIDENCE: 0.45,
        JEV_FALLBACK_ENABLED: true,
        DECISION_PROVIDER: opts.decisionProvider ?? "auto",
        OPENAI_API_KEY: "openai-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
      parseJevAccess: () => "typesafe",
    }));
    vi.doMock("@/lib/admin/feature-flags", () => ({
      isFeatureEnabled: vi.fn().mockResolvedValue(opts.flag ?? true),
      JEV_ENABLED_FLAG: "jev_enabled",
    }));
    vi.doMock("@/lib/adaptive/jev/access", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/adaptive/jev/access")
      >("@/lib/adaptive/jev/access");
      return {
        ...actual,
        resolveJevCredential: async () =>
          opts.hasTypesafe === false
            ? { access: null, reason: "missing_credential" }
            : {
                access: "typesafe",
                apiKey: "test-key",
                baseUrl: "https://api.typesafe.ai",
                model: "jev-1.13.0",
                source: "typesafe_key",
              },
      };
    });

    const jevDecide =
      opts.jevDecide ??
      (async () => ({ ...jevSuccessResult }));
    const openaiDecide =
      opts.openaiDecide ??
      (async () => ({
        provider: "openai_decision",
        action: "teach",
        teachingMode: "step_by_step",
        difficulty: "medium",
        needsPrerequisiteReview: false,
        readyToAdvance: false,
        needsGpt4o: false,
        needsDailyReplan: false,
        misconceptionSeverity: 0,
        modelRecommendation: "gpt-4o-mini",
        confidence: 0.75,
        probabilities: {},
        latencyMs: 200,
        fallbackReason: null,
        telemetry: {
          model: "gpt-4o-mini",
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.0001,
          escalated: false,
          escalationReason: null,
        },
      }));

    const recordUsage = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/credits/service", () => ({ recordUsage }));

    vi.doMock("@/lib/adaptive/jev/providers/jev", () => ({
      JevDecisionProvider: class {
        name = "jev";
        decide = jevDecide;
      },
    }));
    vi.doMock("@/lib/adaptive/jev/providers/openai-fallback", () => ({
      OpenAIDecisionProvider: class {
        name = "openai";
        decide = openaiDecide;
      },
    }));

    const mod = await import("@/lib/adaptive/jev/decision-service");
    return { ...mod, afterCalls, recordUsage };
  }

  it("uses Jev as primary and records real tokens", async () => {
    const { decideNextActions, recordUsage } = await setup({});
    const inserts: unknown[] = [];
    const result = await decideNextActions({
      service: mockService(inserts) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(result.provider).toBe("jev");
    expect(result.action).toBe("practice");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionCode: "ADAPTIVE_JEV",
        model: "jev-1.13.0",
        tokensIn: 500,
        tokensOut: 20,
      }),
    );
  });

  it("escalates low confidence to openai_decision without counting fallback", async () => {
    const { decideNextActions } = await setup({
      jevDecide: async () => ({
        ...jevSuccessResult,
        confidence: 0.2,
        jevUsage: { ...jevSuccessResult.jevUsage, confidence: 0.2 },
      }),
    });
    const inserts: unknown[] = [];
    const result = await decideNextActions({
      service: mockService(inserts) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(result.provider).toBe("openai_decision");
    expect(result.jevUsage?.lowConfidence).toBe(true);
    expect(result.fallbackReason).toBeNull();
    const usage = (inserts[0] as { usage: { jev_low_confidence: boolean } })
      ?.usage;
    expect(usage?.jev_low_confidence).toBe(true);
  });

  it("falls back to openai_fallback on Jev error", async () => {
    const { decideNextActions } = await setup({
      jevDecide: async () => {
        const err = new Error("jev_failed:timeout:10") as Error & {
          jevError: string;
        };
        err.jevError = "timeout";
        throw err;
      },
    });
    const inserts: unknown[] = [];
    const result = await decideNextActions({
      service: mockService(inserts) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(result.provider).toBe("openai_fallback");
  });

  it("does not call Jev when JEV_ENABLED is false", async () => {
    const jevDecide = vi.fn();
    const { decideNextActions } = await setup({
      jevEnabled: false,
      jevDecide,
    });
    await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(jevDecide).not.toHaveBeenCalled();
  });

  it("does not call Jev when DECISION_PROVIDER=openai", async () => {
    const jevDecide = vi.fn();
    const { decideNextActions } = await setup({
      decisionProvider: "openai",
      jevDecide,
    });
    await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(jevDecide).not.toHaveBeenCalled();
  });

  it("does not call Jev for non-pilot users", async () => {
    const jevDecide = vi.fn();
    const { decideNextActions } = await setup({ flag: false, jevDecide });
    await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(jevDecide).not.toHaveBeenCalled();
  });

  it("skips Jev when allowed_actions length < 2", async () => {
    const jevDecide = vi.fn();
    const { decideNextActions } = await setup({ jevDecide });
    await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(["practice"]),
    });
    expect(jevDecide).not.toHaveBeenCalled();
  });

  it("shadow mode returns OpenAI and schedules Jev after()", async () => {
    const jevDecide = vi.fn().mockResolvedValue({ ...jevSuccessResult });
    const { decideNextActions, afterCalls } = await setup({
      shadow: true,
      jevDecide,
    });
    const result = await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(result.provider).toBe("openai_decision");
    expect(result.action).toBe("teach");
    expect(afterCalls.length).toBe(1);
    await afterCalls[0]!();
    expect(jevDecide).toHaveBeenCalled();
  });

  it("shadow Jev error does not change student result", async () => {
    const jevDecide = vi.fn().mockRejectedValue(
      Object.assign(new Error("jev_failed"), { jevError: "timeout" }),
    );
    const { decideNextActions, afterCalls } = await setup({
      shadow: true,
      jevDecide,
    });
    const result = await decideNextActions({
      service: mockService([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: baseState(),
    });
    expect(result.action).toBe("teach");
    await afterCalls[0]!();
    expect(result.action).toBe("teach");
  });
});
