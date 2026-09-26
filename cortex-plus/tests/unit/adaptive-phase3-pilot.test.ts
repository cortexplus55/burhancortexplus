/**
 * Phase 3 pedagogical pilot scenarios — runtime behavior without live LLM/Jev.
 * Proves policy, mastery, review, exam-phase, and anti-loop with concrete numbers.
 */

import { describe, expect, it } from "vitest";
import {
  applyMasteryEvidence,
  emptyTopicMastery,
  seedFromMeasuredLevel,
} from "@/lib/adaptive/mastery-engine";
import {
  applyPolicyToDecision,
  canAdvanceTopic,
  filterCandidateActions,
} from "@/lib/adaptive/policy-engine";
import { examPhaseFromDays, filterActionsForExamPhase } from "@/lib/adaptive/exam-phase";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import {
  nextReviewIntervalDays,
  initialReviewDue,
} from "@/lib/adaptive/review-scheduler";
import { deterministicFallback } from "@/lib/adaptive/jev/normalize";
import { shouldReplanMaster } from "@/lib/adaptive/replan-policy";
import { stabilizeReadiness } from "@/lib/adaptive/readiness";
import { routeTutorModel } from "@/lib/adaptive/tutor-model-router";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { LearningEvidence, JevDecisionResult } from "@/lib/adaptive/types";

const graph: ExamGraph = {
  examPrepId: "pilot-prep",
  topics: [
    {
      topicId: "t-cond",
      topicKey: "conditional_probability",
      title: "Koşullu olasılık",
      prerequisites: [],
      importance: "important",
      weightPercent: 25,
      pageNumbers: [1, 2],
      sourceRefs: [{ page: 1, label: "Bölüm 2" }],
      documentTopicNodeId: null,
      measuredLevel: "weak",
    },
    {
      topicId: "t-bayes",
      topicKey: "bayes",
      title: "Bayes teoremi",
      prerequisites: ["conditional_probability"],
      importance: "important",
      weightPercent: 30,
      pageNumbers: [3, 4],
      sourceRefs: [{ page: 3, label: "Bölüm 3" }],
      documentTopicNodeId: null,
      measuredLevel: null,
    },
    {
      topicId: "t-clt",
      topicKey: "central_limit",
      title: "Merkezi limit teoremi",
      prerequisites: ["bayes"],
      importance: "medium",
      weightPercent: 15,
      pageNumbers: [5],
      sourceRefs: [{ page: 5 }],
      documentTopicNodeId: null,
      measuredLevel: null,
    },
  ],
  edges: [
    {
      fromKey: "conditional_probability",
      toKey: "bayes",
      kind: "prerequisite",
    },
    { fromKey: "bayes", toKey: "central_limit", kind: "prerequisite" },
  ],
};

function ev(
  partial: Partial<LearningEvidence> & { correct: boolean; topicKey?: string },
): LearningEvidence {
  return {
    topicId: "t-cond",
    topicKey: partial.topicKey ?? "conditional_probability",
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

describe("Phase3 pilot — wrong answer → remediation path", () => {
  it("tracks mastery drop and opens remediation actions", () => {
    let state = seedFromMeasuredLevel("t-cond", "conditional_probability", "emerging");
    const before = state.mastery; // ~0.45-ish
    expect(before).toBeGreaterThan(0.3);

    const wrong = applyMasteryEvidence(
      state,
      ev({
        correct: false,
        misconceptionTag: "P(A|B)=P(A)*P(B)",
      }),
    );
    state = wrong.next;
    expect(state.mastery).toBeLessThan(before);
    expect(state.repeatedErrorCount).toBeGreaterThanOrEqual(1);

    const wrong2 = applyMasteryEvidence(
      state,
      ev({
        correct: false,
        misconceptionTag: "P(A|B)=P(A)*P(B)",
      }),
    );
    state = wrong2.next;

    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic: state,
      graph,
      masteryByKey: new Map([
        ["conditional_probability", { mastery: state.mastery, status: state.status }],
        ["bayes", { mastery: 0, status: "unseen" }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: false,
      repeatedMisconception: state.repeatedErrorCount >= 2,
      recentActions: [
        { action: "practice", topicKey: "conditional_probability" },
        { action: "practice", topicKey: "conditional_probability" },
        { action: "practice", topicKey: "conditional_probability" },
      ],
      progressMade: false,
    });

    expect(allowed).not.toContain("advance");
    expect(allowed[0]).not.toBe("practice");
    expect(
      allowed.some((a) =>
        ["reteach", "worked_example", "easier_example", "prerequisite_review"].includes(
          a,
        ),
      ),
    ).toBe(true);

    // Transfer success raises mastery again
    const transfer = applyMasteryEvidence(
      state,
      ev({ correct: true, transfer: true, independent: true }),
    );
    expect(transfer.next.mastery).toBeGreaterThan(state.mastery);
  });
});

describe("Phase3 pilot — fast learner skips endless teach", () => {
  it("removes teach/reteach when mastery and confidence are high", () => {
    const topic = {
      ...emptyTopicMastery("t-cond", "conditional_probability"),
      mastery: 0.78,
      masteryConfidence: 0.7,
      evidenceCount: 5,
      status: "developing" as const,
    };
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic,
      graph,
      masteryByKey: new Map([
        ["conditional_probability", { mastery: 0.78, status: "developing" }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: true,
      repeatedMisconception: false,
    });
    expect(allowed).not.toContain("teach");
    expect(allowed).not.toContain("reteach");
    expect(allowed).toContain("mini_assessment");
  });
});

describe("Phase3 pilot — Jev advance blocked by Policy", () => {
  it("blocks when Jev says advance but evidence insufficient", () => {
    const topic = {
      ...emptyTopicMastery("t-cond", "conditional_probability"),
      mastery: 0.8,
      masteryConfidence: 0.8,
      evidenceCount: 1,
    };
    const jevAdvance: JevDecisionResult = {
      ...deterministicFallback(["advance", "practice"], 0),
      action: "advance",
      readyToAdvance: true,
      confidence: 0.95,
      provider: "jev",
    };
    const policy = applyPolicyToDecision({
      decision: jevAdvance,
      allowedActions: ["practice", "mini_assessment"],
      topic,
      graph,
      masteryByKey: new Map([
        ["conditional_probability", { mastery: 0.8, status: "developing" }],
      ]),
    });
    expect(policy.action).not.toBe("advance");
    expect(policy.readyToAdvance).toBe(false);
    expect(policy.overridden).toBe(true);
  });

  it("allows advance when gates met and Jev agrees", () => {
    const topic = {
      ...emptyTopicMastery("t-cond", "conditional_probability"),
      mastery: 0.82,
      masteryConfidence: 0.75,
      evidenceCount: 6,
      independentAccuracy: 0.8,
      status: "developing" as const,
    };
    const advance = canAdvanceTopic({
      topic,
      independentCount: 4,
      mediumOrHardCorrect: 2,
      graph,
      masteryByKey: new Map([
        ["conditional_probability", { mastery: 0.82, status: "developing" }],
      ]),
    });
    expect(advance.allowed).toBe(true);

    const jev: JevDecisionResult = {
      ...deterministicFallback(["advance", "practice"], 0),
      action: "advance",
      readyToAdvance: true,
      confidence: 0.9,
      provider: "jev",
    };
    const policy = applyPolicyToDecision({
      decision: jev,
      allowedActions: ["advance", "practice", "mini_assessment"],
      topic,
      graph,
      masteryByKey: new Map([
        ["conditional_probability", { mastery: 0.82, status: "developing" }],
      ]),
    });
    expect(policy.action).toBe("advance");
    expect(policy.readyToAdvance).toBe(true);
  });
});

describe("Phase3 pilot — spaced review intervals", () => {
  it("lengthens on success and shortens on failure", () => {
    const examDate = new Date(Date.now() + 40 * 86400000)
      .toISOString()
      .slice(0, 10);
    const first = initialReviewDue();
    expect(first.intervalDays).toBeGreaterThanOrEqual(1);

    const success = nextReviewIntervalDays({
      currentIntervalDays: 3,
      success: true,
      examDate,
    });
    expect(success.intervalDays).toBeGreaterThan(3);

    const fail = nextReviewIntervalDays({
      currentIntervalDays: 7,
      success: false,
      examDate,
    });
    expect(fail.intervalDays).toBeLessThan(7);
  });
});

describe("Phase3 pilot — missed days do not stack blindly", () => {
  it("missed_days can trigger master replan; one wrong answer cannot", () => {
    expect(
      shouldReplanMaster({
        trigger: "missed_days",
        missedDayCount: 2,
      }),
    ).toBe(true);
    // Micro mistakes are not a master replan trigger at all.
    expect(
      shouldReplanMaster({
        trigger: "behind_schedule",
        behindBySessions: 0,
        jevNeedsDailyReplan: true,
      }),
    ).toBe(false);
  });
});

describe("Phase3 pilot — exam approach 20/7/2", () => {
  it("shifts candidate priority and action filters", () => {
    expect(examPhaseFromDays(20)).toBe("learn");
    expect(examPhaseFromDays(7)).toBe("mixed");
    expect(examPhaseFromDays(2)).toBe("cram");

    const topics = graph.topics.map((g) => ({
      ...emptyTopicMastery(g.topicId, g.topicKey),
      mastery: g.topicKey === "conditional_probability" ? 0.35 : 0.1,
      reviewDueAt:
        g.topicKey === "conditional_probability"
          ? new Date(Date.now() - 1000).toISOString()
          : null,
    }));

    const learn = prioritizeTopics({ graph, topics, daysRemaining: 20 });
    const cram = prioritizeTopics({ graph, topics, daysRemaining: 2 });
    expect(cram[0]?.topicKey).toBe("conditional_probability");

    const cramActions = filterActionsForExamPhase(
      ["teach", "scheduled_review", "retrieval_practice", "practice"],
      "cram",
      0.6,
    );
    expect(cramActions).not.toContain("teach");
    expect(learn.length).toBeGreaterThan(0);
  });
});

describe("Phase3 pilot — readiness stability", () => {
  it("one easy win does not jump 58→81", () => {
    const shown = stabilizeReadiness(81, 58);
    expect(shown).toBeLessThan(70);
  });
});

describe("Phase3 pilot — GPT-4o-mini default routing", () => {
  it("stays on mini unless escalation reasons fire", () => {
    const base = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: false,
    });
    expect(base.model).toBe("gpt-4o-mini");

    const escalated = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: true,
      repeatedConfusion: true,
    });
    expect(escalated.model).toBe("gpt-4o");
    expect(escalated.reasons.length).toBeGreaterThan(0);
  });
});


describe("Phase3 pilot — Jev vs fallback safety agreement", () => {
  it("neither path advances without prerequisites", () => {
    const topic = {
      ...emptyTopicMastery("t-bayes", "bayes"),
      mastery: 0.9,
      masteryConfidence: 0.9,
      evidenceCount: 8,
    };
    const masteryByKey = new Map([
      ["conditional_probability", { mastery: 0.2, status: "learning" }],
      ["bayes", { mastery: 0.9, status: "developing" }],
    ]);
    const jev: JevDecisionResult = {
      ...deterministicFallback(["advance", "practice"], 0),
      action: "advance",
      readyToAdvance: true,
      confidence: 0.99,
      provider: "jev",
    };
    const fallback: JevDecisionResult = {
      ...deterministicFallback(["advance", "practice"], 0),
      action: "advance",
      readyToAdvance: true,
      confidence: 0.5,
      provider: "openai_fallback",
    };
    for (const decision of [jev, fallback]) {
      const policy = applyPolicyToDecision({
        decision,
        allowedActions: ["advance", "practice", "prerequisite_review"],
        topic,
        graph,
        masteryByKey,
      });
      expect(policy.action).not.toBe("advance");
      expect(policy.needsPrerequisiteReview).toBe(true);
    }
  });
});
