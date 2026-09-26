import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  jevCircuitAllows,
  jevCircuitFailure,
  jevCircuitReset,
  jevCircuitSuccess,
} from "@/lib/adaptive/jev/circuit-breaker";

describe("Jev circuit breaker", () => {
  beforeEach(() => {
    jevCircuitReset();
  });

  it("opens after repeated failures", () => {
    expect(jevCircuitAllows()).toBe(true);
    jevCircuitFailure();
    jevCircuitFailure();
    expect(jevCircuitAllows()).toBe(true);
    jevCircuitFailure();
    expect(jevCircuitAllows()).toBe(false);
  });

  it("resets on success", () => {
    jevCircuitFailure();
    jevCircuitFailure();
    jevCircuitSuccess();
    jevCircuitFailure();
    expect(jevCircuitAllows()).toBe(true);
  });
});

describe("Jev decision service fallback on 500", () => {
  beforeEach(() => {
    jevCircuitReset();
    vi.resetModules();
  });

  it("returns normalized fallback when Jev HTTP fails", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        TYPESAFE_API_KEY: "test-key",
        JEV_MODEL: "systemone",
        JEV_ENABLED: true,
        JEV_TIMEOUT_MS: 500,
        JEV_FALLBACK_ENABLED: true,
        OPENAI_API_KEY: undefined,
        OPENAI_STANDARD_MODEL: "gpt-4o-mini",
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

    const { decideNextActions } = await import(
      "@/lib/adaptive/jev/decision-service"
    );

    const inserts: unknown[] = [];
    const service = {
      from: () => ({
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    };

    const result = await decideNextActions({
      service: service as never,
      userId: "u1",
      examPrepId: "00000000-0000-0000-0000-000000000001",
      state: {
        student: {
          exam_days_remaining: 10,
          session_minutes_remaining: 20,
          fatigue_signal: 0.1,
        },
        objective: {
          topic_id: "t",
          mastery: 0.4,
          mastery_confidence: 0.5,
          recent_accuracy: 0.5,
          attempt_count: 3,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 0,
          repeated_misconception: false,
        },
        plan: { today_target: "x", behind_schedule: false },
        allowed_actions: ["practice", "reteach", "teach"],
      },
    });

    expect(result.provider).toBe("deterministic");
    expect(["practice", "reteach", "teach"]).toContain(result.action);
    expect(result.fallbackReason).toBeTruthy();
    expect(inserts.length).toBeGreaterThanOrEqual(1);
  });
});
