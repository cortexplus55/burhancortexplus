import { describe, expect, it } from "vitest";
import { normalizeJevAnswers } from "@/lib/adaptive/jev/normalize";
import { estimateTokenCostUsd } from "@/lib/adaptive/analytics";

const allowed = ["practice", "reteach", "teach", "advance"] as const;

describe("normalizeJevAnswers (official TypeSafe shapes)", () => {
  it("parses noul/choice/score correctly with thresholds", () => {
    const raw = {
      model: "jev-1.13.0",
      answers: {
        next_action: {
          type: "choice",
          choice: "reteach",
          probabilities: { reteach: 0.8, practice: 0.2 },
          confidence: 0.7,
        },
        teaching_mode: {
          type: "choice",
          choice: "analogy",
          probabilities: { analogy: 0.9, step_by_step: 0.1 },
          confidence: 0.85,
        },
        difficulty: {
          type: "choice",
          choice: "easy",
          probabilities: { easy: 1 },
          confidence: 0.9,
        },
        misconception_severity: {
          type: "score",
          score: 1.05,
          probabilities: { "0": 0, "1": 0.95, "2": 0.05, "3": 0 },
          confidence: 0.9,
        },
        needs_prerequisite_review: { type: "noul", noul: 0.95 },
        ready_to_advance: { type: "noul", noul: 0.6 },
        needs_gpt4o: { type: "noul", noul: 0.3 },
        needs_daily_replan: { type: "noul", noul: 0.1 },
      },
    };

    const r = normalizeJevAnswers(raw, {
      allowedActions: [...allowed],
      latencyMs: 120,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.action).toBe("reteach");
    expect(r.result.confidence).toBeCloseTo(0.7);
    expect(r.result.needsPrerequisiteReview).toBe(true); // 0.95 >= 0.5
    expect(r.result.readyToAdvance).toBe(false); // 0.6 < 0.7
    expect(r.result.needsGpt4o).toBe(false); // 0.3 < 0.5
    expect(r.result.misconceptionSeverity).toBe(1); // round(1.05)
    expect(r.rawMisconceptionSeverity).toBeCloseTo(1.05);
    expect(r.result.probabilities["next_action.reteach"]).toBeCloseTo(0.8);
    expect(r.result.probabilities.needs_prerequisite_review).toBeCloseTo(0.95);
  });

  it("rejects choice outside allowed", () => {
    const r = normalizeJevAnswers(
      {
        answers: {
          next_action: {
            type: "choice",
            choice: "scheduled_review",
            confidence: 0.9,
          },
        },
      },
      { allowedActions: [...allowed], latencyMs: 1 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_response");
  });
});

describe("estimateTokenCostUsd for Jev", () => {
  it("prices jev-1.13.0 at $0.042 per 1M input, output free", () => {
    const cost = estimateTokenCostUsd("jev-1.13.0", 1_000_000, 500);
    expect(cost).toBeCloseTo(0.042, 6);
  });

  it("prices typesafe-ai/jev the same way", () => {
    expect(estimateTokenCostUsd("typesafe-ai/jev", 1_000_000, 0)).toBeCloseTo(
      0.042,
      6,
    );
  });
});
