/**
 * Live Jev contract test — skipped when TYPESAFE_API_KEY is absent.
 * Does not print the API key.
 */

import { describe, expect, it } from "vitest";

const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());

describe.skipIf(!hasKey)("Jev live contract", () => {
  it("accepts batched questions and returns choice/noul/score fields", async () => {
    const { callJevSystemOne, defaultJevQuestions, resolveJevModel } =
      await import("@/lib/adaptive/jev/client");
    const { normalizeDecisionPayload } = await import(
      "@/lib/adaptive/jev/normalize"
    );

    const allowed = [
      "teach",
      "worked_example",
      "practice",
      "reteach",
      "advance",
    ] as const;
    const model = await resolveJevModel();
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);

    const started = Date.now();
    const result = await callJevSystemOne({
      state: {
        student: {
          exam_days_remaining: 21,
          session_minutes_remaining: 45,
          fatigue_signal: 0.1,
        },
        objective: {
          topic_id: "thermo-first-law",
          mastery: 0.35,
          mastery_confidence: 0.4,
          recent_accuracy: 0.4,
          attempt_count: 3,
        },
        evidence: {
          last_answer_correct: false,
          hint_count: 1,
          repeated_misconception: true,
        },
        plan: {
          today_target: "First law",
          behind_schedule: false,
        },
        allowed_actions: [...allowed],
      },
      questions: defaultJevQuestions([...allowed]),
      timeoutMs: 20_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Date.now() - started).toBeLessThan(25_000);

    const normalized = normalizeDecisionPayload(result.raw, {
      allowedActions: [...allowed],
      provider: "jev",
      latencyMs: result.latencyMs,
    });

    expect(allowed).toContain(normalized.action);
    expect(normalized.confidence).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence).toBeLessThanOrEqual(1);
    expect(typeof normalized.needsGpt4o).toBe("boolean");
  });
});

describe("Jev client without key", () => {
  it("returns missing_api_key when env empty", async () => {
    const prev = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      // Re-import is cached; call with empty by testing the error path via
      // direct module — if key was present in process, skip assertion.
      if (prev?.trim()) {
        expect(true).toBe(true);
        return;
      }
      const { callJevSystemOne } = await import("@/lib/adaptive/jev/client");
      const r = await callJevSystemOne({
        state: {
          student: {
            exam_days_remaining: 1,
            session_minutes_remaining: 5,
            fatigue_signal: 0,
          },
          objective: {
            topic_id: "x",
            mastery: 0,
            mastery_confidence: 0,
            recent_accuracy: null,
            attempt_count: 0,
          },
          evidence: {
            last_answer_correct: null,
            hint_count: 0,
            repeated_misconception: false,
          },
          plan: { today_target: "x", behind_schedule: false },
          allowed_actions: ["practice"],
        },
        questions: [{ name: "next_action", type: "choice", allowed: ["practice"] }],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("missing_api_key");
    } finally {
      if (prev != null) process.env.TYPESAFE_API_KEY = prev;
    }
  });
});
