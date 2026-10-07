/**
 * Live Jev contract test — skipped unless RUN_JEV_LIVE=1 and a credential exists.
 * Does not print API keys.
 *
 * bash: RUN_JEV_LIVE=1 npm run test:jev-live
 * PowerShell: $env:RUN_JEV_LIVE='1'; npm run test:jev-live
 */

import { describe, expect, it } from "vitest";

const hasCredential = Boolean(
  process.env.TYPESAFE_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim(),
);
const runLive =
  process.env.RUN_JEV_LIVE === "1" && hasCredential;

describe.skipIf(!runLive)("Jev live contract", () => {
  it("lists models, calls SystemOne with default questions, normalizes", async () => {
    const { callJevSystemOne, defaultJevQuestions, listJevModels } =
      await import("@/lib/adaptive/jev/client");
    const { normalizeJevAnswers } = await import(
      "@/lib/adaptive/jev/normalize"
    );
    const { estimateTokenCostUsd } = await import(
      "@/lib/adaptive/analytics"
    );

    const models = await listJevModels({ timeoutMs: 20_000 });
    expect(models.ok).toBe(true);
    if (models.ok) {
      expect(models.names.length).toBeGreaterThan(0);
    }

    const allowed = [
      "teach",
      "worked_example",
      "practice",
      "reteach",
      "advance",
    ] as const;

    const weakState = {
      student: {
        exam_days_remaining: 21,
        session_minutes_remaining: 45,
        fatigue_signal: 0.1,
      },
      objective: {
        topic_id: "synthetic-topic-a",
        mastery: 0.2,
        mastery_confidence: 0.3,
        recent_accuracy: 0.2,
        attempt_count: 4,
      },
      evidence: {
        last_answer_correct: false,
        hint_count: 2,
        repeated_misconception: true,
      },
      plan: {
        today_target: "Synthetic weak scenario",
        behind_schedule: true,
      },
      allowed_actions: [...allowed],
    };

    const strongState = {
      ...weakState,
      objective: {
        topic_id: "synthetic-topic-b",
        mastery: 0.88,
        mastery_confidence: 0.9,
        recent_accuracy: 0.95,
        attempt_count: 8,
        independent_evidence: 4,
      },
      evidence: {
        last_answer_correct: true,
        hint_count: 0,
        repeated_misconception: false,
      },
      plan: {
        today_target: "Synthetic strong scenario",
        behind_schedule: false,
      },
    };

    const questions = defaultJevQuestions([...allowed]);
    const weak = await callJevSystemOne({
      state: weakState,
      questions,
      timeoutMs: 20_000,
    });
    expect(weak.ok).toBe(true);
    if (!weak.ok) return;

    expect(weak.usage.inputTokens).toBeGreaterThan(0);
    expect(typeof weak.model).toBe("string");
    expect(weak.model.length).toBeGreaterThan(0);

    const answers = (weak.raw as { answers: Record<string, { type: string }> })
      .answers;
    for (const key of Object.keys(questions)) {
      expect(answers[key]?.type).toBe(questions[key].type);
    }

    const normalized = normalizeJevAnswers(weak.raw, {
      allowedActions: [...allowed],
      provider: "jev",
      latencyMs: weak.latencyMs,
    });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(allowed).toContain(normalized.result.action);
      expect(normalized.result.confidence).toBeGreaterThanOrEqual(0);
      expect(normalized.result.confidence).toBeLessThanOrEqual(1);
    }

    const cost = estimateTokenCostUsd(
      weak.model,
      weak.usage.inputTokens,
      weak.usage.outputTokens,
    );
    console.info(
      `[jev-live] weak latency=${weak.latencyMs}ms model=${weak.model} tokensIn=${weak.usage.inputTokens} estUsd=${cost.toFixed(6)} action=${normalized.ok ? normalized.result.action : "?"}`,
    );

    const strong = await callJevSystemOne({
      state: strongState,
      questions,
      timeoutMs: 20_000,
    });
    expect(strong.ok).toBe(true);
    if (strong.ok) {
      const n2 = normalizeJevAnswers(strong.raw, {
        allowedActions: [...allowed],
        provider: "jev",
        latencyMs: strong.latencyMs,
      });
      console.info(
        `[jev-live] strong action=${n2.ok ? n2.result.action : "?"} weakAction=${normalized.ok ? normalized.result.action : "?"} (no hard assert on action)`,
      );
    }

    // Invalid model → invalid_request, no retry
    const bad = await callJevSystemOne({
      state: weakState,
      questions: {
        is_ok: {
          type: "noul",
          instructions: "Is the student ready?",
          criteria: { true: "yes", false: "no" },
        },
      },
      timeoutMs: 15_000,
      credential: {
        access: models.ok && models.access === "gateway" ? "gateway" : "typesafe",
        apiKey:
          process.env.TYPESAFE_API_KEY?.trim() ||
          process.env.AI_GATEWAY_API_KEY?.trim() ||
          "",
        baseUrl:
          models.ok && models.access === "gateway"
            ? "https://ai-gateway.vercel.sh/typesafe"
            : "https://api.typesafe.ai",
        model: "definitely-not-a-real-jev-model-xyz",
        source: "typesafe_key",
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe("invalid_request");
      expect(bad.attempts).toBe(1);
    }
  });
});

// Dinamik import tüm paket koşarken 5 sn varsayılanını aşıyordu.
describe("Jev client without credential", { timeout: 30_000 }, () => {
  it("returns missing_credential when no key", async () => {
    if (hasCredential) {
      expect(true).toBe(true);
      return;
    }
    const { callJevSystemOne, defaultJevQuestions } = await import(
      "@/lib/adaptive/jev/client"
    );
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
        allowed_actions: ["practice", "teach"],
      },
      questions: defaultJevQuestions(["practice", "teach"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("missing_credential");
  });
});
