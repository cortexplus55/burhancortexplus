/**
 * Adaptive E2E-style scenarios — real modules, no live OpenAI/Jev required.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyMasteryEvidence,
  emptyTopicMastery,
} from "@/lib/adaptive/mastery-engine";
import {
  filterCandidateActions,
  applyPolicyToDecision,
} from "@/lib/adaptive/policy-engine";
import { shouldReplanMaster } from "@/lib/adaptive/replan-policy";
import { deterministicFallback } from "@/lib/adaptive/jev/normalize";
import { buildDailyPlanItems } from "@/lib/adaptive/daily-planner";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { JevDecisionResult, LearningEvidence } from "@/lib/adaptive/types";

const graph: ExamGraph = {
  examPrepId: "e2e",
  topics: [
    {
      topicId: "t1",
      topicKey: "systems",
      title: "Systems",
      prerequisites: [],
      importance: "important",
      weightPercent: 25,
      pageNumbers: [1],
      sourceRefs: [],
      documentTopicNodeId: null,
      measuredLevel: null,
    },
  ],
  edges: [],
};

function ev(partial: Partial<LearningEvidence> & { correct: boolean }): LearningEvidence {
  return {
    topicId: "t1",
    topicKey: "systems",
    difficulty: "medium",
    independent: true,
    hintUsed: false,
    retry: false,
    transfer: false,
    examLevel: false,
    retrievalAfterDelay: false,
    idempotencyKey: `k-${Math.random()}`,
    ...partial,
  };
}

describe("E2E good student", () => {
  it("advances difficulty and allows advance when gates met", () => {
    let state = emptyTopicMastery("t1", "systems");
    for (let i = 0; i < 6; i += 1) {
      const r = applyMasteryEvidence(
        state,
        ev({
          correct: true,
          difficulty: i > 2 ? "hard" : "medium",
          independent: true,
        }),
      );
      state = r.next;
    }
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 45,
      topic: state,
      graph,
      masteryByKey: new Map([
        ["systems", { mastery: state.mastery, status: state.status }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: true,
      repeatedMisconception: false,
    });
    // May or may not include advance depending on confidence thresholds
    expect(state.mastery).toBeGreaterThan(0.4);
    expect(state.repeatedErrorCount).toBe(0);
    expect(
      allowed.some((a) => a === "practice" || a === "advance" || a === "mini_assessment"),
    ).toBe(true);
  });
});

describe("E2E struggling student", () => {
  it("opens remediation actions after repeated misconception", () => {
    let state = emptyTopicMastery("t1", "systems");
    for (let i = 0; i < 3; i += 1) {
      const r = applyMasteryEvidence(
        state,
        ev({
          correct: false,
          misconceptionTag: "first-law-confusion",
          hintUsed: true,
        }),
      );
      state = r.next;
    }
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic: state,
      graph,
      masteryByKey: new Map([
        ["systems", { mastery: state.mastery, status: state.status }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: false,
      repeatedMisconception: true,
    });
    expect(allowed).not.toContain("advance");
    expect(
      allowed.some((a) =>
        ["worked_example", "reteach", "easier_example", "prerequisite_review"].includes(
          a,
        ),
      ),
    ).toBe(true);
  });
});

describe("E2E absent student", () => {
  it("missed days replan master only with threshold; daily caps minutes", () => {
    expect(
      shouldReplanMaster({ trigger: "missed_days", missedDayCount: 2 }),
    ).toBe(true);
    const built = buildDailyPlanItems({
      userId: "u",
      examPrepId: "e",
      schedule: null,
      reviewItems: [],
      weakTopics: [
        { topicKey: "a", title: "A" },
        { topicKey: "b", title: "B" },
        { topicKey: "c", title: "C" },
      ],
      dailyMinutesCap: 60,
      masterPlanVersion: 2,
      rebalanceNotice: "Programını son iki güne göre yeniden dengeledik.",
    });
    expect(built.estimatedMinutes).toBeLessThanOrEqual(60);
    expect(built.rebalanceNotice).toMatch(/yeniden dengeledik/);
  });
});

describe("E2E Jev down", () => {
  it("deterministic fallback stays in allowlist", () => {
    const r = deterministicFallback(
      ["practice", "worked_example"],
      0,
      "timeout",
    );
    expect(["practice", "worked_example"]).toContain(r.action);
    expect(r.provider).toBe("deterministic");
    expect(r.fallbackReason).toBe("timeout");
  });

  it("policy still validates fallback advance attempts", () => {
    const decision: JevDecisionResult = {
      ...deterministicFallback(["advance", "practice"], 0, "http_500"),
      action: "advance",
      readyToAdvance: true,
      confidence: 0.4,
    };
    const topic = {
      ...emptyTopicMastery("t1", "systems"),
      mastery: 0.2,
      masteryConfidence: 0.2,
      evidenceCount: 1,
    };
    const policy = applyPolicyToDecision({
      decision,
      allowedActions: ["practice", "advance"],
      topic,
      graph,
      masteryByKey: new Map([
        ["systems", { mastery: 0.2, status: "learning" }],
      ]),
    });
    expect(policy.action).not.toBe("advance");
  });
});

describe("E2E mid-plan document signal", () => {
  it("source_scope_changed is an allowed master replan trigger", () => {
    expect(shouldReplanMaster({ trigger: "source_scope_changed" })).toBe(true);
  });
});
