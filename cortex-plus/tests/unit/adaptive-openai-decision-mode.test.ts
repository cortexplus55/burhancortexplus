import { beforeEach, describe, expect, it, vi } from "vitest";
import { envSchema, decisionProviderFromEnv } from "@/lib/env";
import {
  decisionEscalationReason,
  tryDeterministicFastPath,
} from "@/lib/adaptive/policy-engine";
import {
  decisionEngineStatus,
  shouldAttemptJev,
} from "@/lib/adaptive/jev/provider-mode";
import { scoreDecisionAgreement } from "@/lib/adaptive/jev/eval-case";
import { sessionAiCostReport } from "@/lib/adaptive/analytics";
import type { CompactDecisionState } from "@/lib/adaptive/types";
import { jevCircuitReset } from "@/lib/adaptive/jev/circuit-breaker";

function state(
  patch: Partial<CompactDecisionState> & {
    allowed_actions: CompactDecisionState["allowed_actions"];
  },
): CompactDecisionState {
  return {
    student: {
      exam_days_remaining: 20,
      session_minutes_remaining: 30,
      fatigue_signal: 0.1,
      ...patch.student,
    },
    objective: {
      topic_id: "topic-1",
      mastery: 0.4,
      mastery_confidence: 0.4,
      recent_accuracy: 0.5,
      attempt_count: 2,
      ...patch.objective,
    },
    evidence: {
      last_answer_correct: null,
      hint_count: 0,
      repeated_misconception: false,
      prerequisite_status: "met",
      ...patch.evidence,
    },
    plan: {
      today_target: "Olasılık",
      behind_schedule: false,
      review_due: false,
      ...patch.plan,
    },
    allowed_actions: patch.allowed_actions,
    candidate_topics: patch.candidate_topics,
  };
}

const decisionJson = (confidence: number, action = "practice") =>
  JSON.stringify({
    action,
    teachingMode: "step_by_step",
    difficulty: "medium",
    needsPrerequisiteReview: false,
    readyToAdvance: false,
    needsHigherModel: false,
    needsDailyReplan: false,
    confidence,
    reasonCodes: ["PLAN_OBJECTIVE"],
    misconception_severity: 0,
  });

describe("decision provider mode", () => {
  it("parses env without a TypeSafe key", () => {
    const parsed = envSchema.safeParse({ NEXT_PUBLIC_APP_NAME: "Cortex Plus" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TYPESAFE_API_KEY).toBeUndefined();
    expect(parsed.data.DECISION_PROVIDER).toBe("auto");
    expect(decisionProviderFromEnv(undefined)).toBe("auto");
    expect(decisionProviderFromEnv("openai")).toBe("openai");
  });

  it("does not attempt Jev when disabled or unkeyed", () => {
    expect(
      shouldAttemptJev({
        mode: "auto",
        jevEnabledEnv: false,
        jevFlag: true,
        hasApiKey: true,
        circuitAllows: true,
      }).attempt,
    ).toBe(false);
    expect(
      shouldAttemptJev({
        mode: "auto",
        jevEnabledEnv: true,
        jevFlag: true,
        hasApiKey: false,
        circuitAllows: true,
      }),
    ).toEqual({ attempt: false, fallbackBecauseCircuit: false });
    expect(
      shouldAttemptJev({
        mode: "openai",
        jevEnabledEnv: true,
        jevFlag: true,
        hasApiKey: true,
        circuitAllows: true,
      }).attempt,
    ).toBe(false);
  });

  it("treats an open circuit as a real fallback, not a disabled provider", () => {
    expect(
      shouldAttemptJev({
        mode: "auto",
        jevEnabledEnv: true,
        jevFlag: true,
        hasApiKey: true,
        circuitAllows: false,
      }),
    ).toEqual({ attempt: false, fallbackBecauseCircuit: true });
  });

  it("labels OpenAI primary while Jev waits", () => {
    expect(
      decisionEngineStatus({
        mode: "auto",
        jevEnabledEnv: false,
        hasApiKey: false,
      }),
    ).toMatchObject({
      decisionLabel: "OpenAI temporary provider",
      jevLabel: "Waiting for API access / disabled",
      openaiPrimary: true,
    });
  });
});

describe("deterministic fast path", () => {
  it("advances without a model when gates are unambiguous", () => {
    const result = tryDeterministicFastPath(
      state({
        allowed_actions: ["advance", "practice", "mini_assessment"],
        objective: {
          topic_id: "topic-1",
          mastery: 0.9,
          mastery_confidence: 0.9,
          recent_accuracy: 0.9,
          attempt_count: 6,
          independent_evidence: 3,
        },
        evidence: {
          last_answer_correct: true,
          hint_count: 0,
          repeated_misconception: false,
          prerequisite_status: "met",
        },
      }),
    );
    expect(result?.provider).toBe("deterministic");
    expect(result?.action).toBe("advance");
    expect(result?.fallbackReason).toBeNull();
    expect(result?.reasonCodes).toContain("READY_TO_ADVANCE");
  });

  it("prefers a due review over a model call", () => {
    const result = tryDeterministicFastPath(
      state({
        allowed_actions: ["scheduled_review", "practice", "retrieval_practice"],
        plan: {
          today_target: "Olasılık",
          behind_schedule: false,
          review_due: true,
        },
      }),
    );
    expect(result?.action).toBe("scheduled_review");
    expect(result?.reasonCodes).toContain("REVIEW_DUE");
    expect(result?.fallbackReason).toBeNull();
  });

  it("does not fast-path review when a higher block exists", () => {
    const result = tryDeterministicFastPath(
      state({
        allowed_actions: ["reteach", "worked_example", "practice"],
        plan: {
          today_target: "Olasılık",
          behind_schedule: false,
          review_due: true,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 1,
          repeated_misconception: false,
          prerequisite_status: "met",
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("uses the only remaining candidate", () => {
    const result = tryDeterministicFastPath(
      state({ allowed_actions: ["prerequisite_review"] }),
    );
    expect(result?.action).toBe("prerequisite_review");
    expect(result?.reasonCodes).toContain("SINGLE_CANDIDATE");
  });
});

describe("decision escalation reasons", () => {
  it("escalates low confidence before other hints", () => {
    expect(
      decisionEscalationReason({
        confidence: 0.4,
        repeatedMisconception: false,
        misconceptionSeverity: 0,
        hints: { complexReasoning: true },
      }),
    ).toBe("LOW_DECISION_CONFIDENCE");
  });

  it("stays on mini when the decision is confident and hints are clear", () => {
    expect(
      decisionEscalationReason({
        confidence: 0.9,
        repeatedMisconception: false,
        misconceptionSeverity: 0,
      }),
    ).toBeNull();
  });
});

describe("offline Jev comparison and session cost", () => {
  it("scores agreement without calling a provider", () => {
    const score = scoreDecisionAgreement([
      {
        openaiAction: "practice",
        jevAction: "practice",
        policyValid: true,
        interventionSuccess: true,
        latencyMs: 100,
        costUsd: 0.01,
      },
      {
        openaiAction: "reteach",
        jevAction: "practice",
        policyValid: true,
        interventionSuccess: false,
        latencyMs: 300,
        costUsd: 0.03,
      },
    ]);
    expect(score.agreementRate).toBe(0.5);
    expect(score.policyValidRate).toBe(1);
    expect(score.disagreements).toBe(1);
    expect(score.interventionSuccessRate).toBe(0.5);
  });

  it("splits decision cost from content cost", () => {
    const [report] = sessionAiCostReport(
      [
        {
          id: "s1",
          startedAt: "2026-09-27T10:00:00.000Z",
          endedAt: "2026-09-27T10:30:00.000Z",
        },
      ],
      [
        {
          actionCode: "ADAPTIVE_DECISION",
          model: "gpt-4o-mini",
          tokensIn: 100,
          tokensOut: 40,
          createdAt: "2026-09-27T10:05:00.000Z",
        },
        {
          actionCode: "ADAPTIVE_DECISION_ESCALATION",
          model: "gpt-4o",
          tokensIn: 80,
          tokensOut: 30,
          createdAt: "2026-09-27T10:06:00.000Z",
        },
        {
          actionCode: "ADAPTIVE_ACTION_CONTENT",
          model: "gpt-4o-mini",
          tokensIn: 500,
          tokensOut: 200,
          createdAt: "2026-09-27T10:07:00.000Z",
        },
      ],
    );
    expect(report?.miniDecisionTokens).toBe(140);
    expect(report?.escalationTokens).toBe(110);
    expect(report?.contentTokens).toBe(700);
    expect(report?.decisionCostUsd).toBeGreaterThan(0);
    expect(report?.contentCostUsd).toBeGreaterThan(0);
    expect(report?.totalUsd).toBeCloseTo(
      (report?.decisionCostUsd ?? 0) + (report?.contentCostUsd ?? 0),
    );
  });
});

describe("OpenAI primary decision service", () => {
  beforeEach(() => {
    jevCircuitReset();
    vi.resetModules();
  });

  function serviceDouble(inserts: unknown[]) {
    return {
      from: () => ({
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    };
  }

  async function loadService(env: Record<string, unknown>, create: ReturnType<typeof vi.fn>) {
    vi.doMock("@/lib/env", () => ({ env }));
    vi.doMock("@/lib/admin/feature-flags", () => ({
      isFeatureEnabled: vi.fn().mockResolvedValue(false),
      JEV_ENABLED_FLAG: "jev_enabled",
    }));
    vi.doMock("openai", () => ({
      default: class {
        chat = { completions: { create } };
      },
    }));
    return import("@/lib/adaptive/jev/decision-service");
  }

  it("uses openai_decision when Jev is disabled and no key exists", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: decisionJson(0.92) } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
    const { decideNextActions } = await loadService(
      {
        TYPESAFE_API_KEY: undefined,
        JEV_MODEL: undefined,
        JEV_ENABLED: false,
        JEV_TIMEOUT_MS: 500,
        JEV_FALLBACK_ENABLED: true,
        JEV_FALLBACK: true,
        DECISION_PROVIDER: "auto",
        OPENAI_API_KEY: "test-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
      create,
    );
    const inserts: unknown[] = [];
    const result = await decideNextActions({
      service: serviceDouble(inserts) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: state({
        allowed_actions: ["practice", "reteach", "teach"],
      }),
    });
    expect(result.provider).toBe("openai_decision");
    expect(result.fallbackReason).toBeNull();
    expect(result.action).toBe("practice");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.model).toBe("gpt-4o-mini");
    const audit = inserts.find(
      (row) =>
        typeof row === "object" &&
        row != null &&
        "provider" in row &&
        (row as { provider: string }).provider === "openai_decision",
    ) as { fallback_reason: string | null; usage: { escalated: boolean } };
    expect(audit.fallback_reason).toBeNull();
    expect(audit.usage.escalated).toBe(false);
  });

  it("does not call OpenAI for an unambiguous advance", async () => {
    const create = vi.fn();
    const { decideNextActions } = await loadService(
      {
        TYPESAFE_API_KEY: undefined,
        JEV_ENABLED: false,
        JEV_FALLBACK_ENABLED: true,
        DECISION_PROVIDER: "auto",
        OPENAI_API_KEY: "test-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
      create,
    );
    const result = await decideNextActions({
      service: serviceDouble([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: state({
        allowed_actions: ["advance", "practice"],
        objective: {
          topic_id: "topic-1",
          mastery: 0.92,
          mastery_confidence: 0.8,
          recent_accuracy: 0.9,
          attempt_count: 5,
          independent_evidence: 3,
        },
        evidence: {
          last_answer_correct: true,
          hint_count: 0,
          repeated_misconception: false,
          prerequisite_status: "met",
        },
      }),
    });
    expect(result.action).toBe("advance");
    expect(result.provider).toBe("deterministic");
    expect(create).not.toHaveBeenCalled();
  });

  it("escalates a low-confidence mini decision to gpt-4o", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: decisionJson(0.2) } }],
        usage: { prompt_tokens: 10, completion_tokens: 6 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: decisionJson(0.88, "reteach") } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      });
    const { decideNextActions } = await loadService(
      {
        TYPESAFE_API_KEY: undefined,
        JEV_ENABLED: false,
        JEV_FALLBACK_ENABLED: true,
        DECISION_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
      create,
    );
    const result = await decideNextActions({
      service: serviceDouble([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: state({ allowed_actions: ["practice", "reteach", "teach"] }),
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.model).toBe("gpt-4o");
    expect(result.provider).toBe("openai_decision");
    expect(result.action).toBe("reteach");
    expect(result.telemetry?.escalated).toBe(true);
    expect(result.telemetry?.escalationReason).toBe("LOW_DECISION_CONFIDENCE");
    expect(result.fallbackReason).toBeNull();
  });

  it("falls back deterministically after one invalid repair", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "not-json" } }],
      usage: { prompt_tokens: 4, completion_tokens: 2 },
    });
    const { decideNextActions } = await loadService(
      {
        TYPESAFE_API_KEY: undefined,
        JEV_ENABLED: false,
        JEV_FALLBACK_ENABLED: true,
        DECISION_PROVIDER: "auto",
        OPENAI_API_KEY: "test-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
      create,
    );
    const result = await decideNextActions({
      service: serviceDouble([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: state({ allowed_actions: ["practice", "teach"] }),
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("deterministic");
    expect(result.fallbackReason).toContain("schema_invalid");
  });

  it("records openai_fallback only after Jev actually fails", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: decisionJson(0.91) } }],
      usage: { prompt_tokens: 9, completion_tokens: 5 },
    });
    vi.doMock("@/lib/env", () => ({
      env: {
        TYPESAFE_API_KEY: "test-key",
        JEV_MODEL: "systemone",
        JEV_ENABLED: true,
        JEV_TIMEOUT_MS: 500,
        JEV_FALLBACK_ENABLED: true,
        DECISION_PROVIDER: "auto",
        OPENAI_API_KEY: "test-key",
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
        OPENAI_ADVANCED_MODEL: "gpt-4o",
      },
    }));
    vi.doMock("@/lib/admin/feature-flags", () => ({
      isFeatureEnabled: vi.fn().mockResolvedValue(true),
      JEV_ENABLED_FLAG: "jev_enabled",
    }));
    vi.doMock("@/lib/adaptive/jev/client", () => ({
      callJevSystemOne: vi.fn().mockResolvedValue({
        ok: false,
        error: "http_500",
        latencyMs: 12,
      }),
      defaultJevQuestions: vi.fn().mockReturnValue([]),
      resolveJevModel: vi.fn().mockResolvedValue("systemone"),
    }));
    vi.doMock("openai", () => ({
      default: class {
        chat = { completions: { create } };
      },
    }));
    const { decideNextActions } = await import(
      "@/lib/adaptive/jev/decision-service"
    );
    const result = await decideNextActions({
      service: serviceDouble([]) as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: state({ allowed_actions: ["practice", "reteach", "teach"] }),
    });
    expect(result.provider).toBe("openai_fallback");
    expect(result.fallbackReason).toContain("http_500");
    expect(result.fallbackReason).not.toContain("jev_disabled");
  });
});
