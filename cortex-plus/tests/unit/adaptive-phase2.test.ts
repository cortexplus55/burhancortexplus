/**
 * Adaptive Phase 2 — mastery gates, plan stability, Jev fixtures, eval, daily plan.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyMasteryEvidence,
  emptyTopicMastery,
  seedFromMeasuredLevel,
  evidenceStrength,
  statusFromMastery,
} from "@/lib/adaptive/mastery-engine";
import {
  canAdvanceTopic,
  filterCandidateActions,
  applyPolicyToDecision,
} from "@/lib/adaptive/policy-engine";
import { shouldReplanMaster, shouldReplanDaily } from "@/lib/adaptive/replan-policy";
import { normalizeDecisionPayload } from "@/lib/adaptive/jev/normalize";
import { buildDecisionState } from "@/lib/adaptive/jev/build-decision-state";
import { buildDailyPlanItems } from "@/lib/adaptive/daily-planner";
import { deterministicGrade } from "@/lib/adaptive/evaluate-answer";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { JevDecisionResult, LearningEvidence } from "@/lib/adaptive/types";

function evidence(
  partial: Partial<LearningEvidence> & { correct: boolean },
): LearningEvidence {
  return {
    topicId: "t1",
    topicKey: "termodinamik",
    difficulty: "medium",
    independent: true,
    hintUsed: false,
    retry: false,
    transfer: false,
    examLevel: false,
    retrievalAfterDelay: false,
    idempotencyKey: "k1",
    ...partial,
  };
}

const graph: ExamGraph = {
  examPrepId: "p1",
  topics: [
    {
      topicId: "t1",
      topicKey: "a",
      title: "A",
      prerequisites: ["prereq"],
      importance: "important",
      weightPercent: 20,
      pageNumbers: [],
      sourceRefs: [],
      documentTopicNodeId: null,
      measuredLevel: null,
    },
    {
      topicId: "t0",
      topicKey: "prereq",
      title: "Prereq",
      prerequisites: [],
      importance: "medium",
      weightPercent: 10,
      pageNumbers: [],
      sourceRefs: [],
      documentTopicNodeId: null,
      measuredLevel: null,
    },
  ],
  edges: [{ fromKey: "prereq", toKey: "a", kind: "prerequisite" }],
};

describe("Mastery boundary gates", () => {
  it("single easy correct cannot reach mastered", () => {
    const state = emptyTopicMastery("t1", "a");
    const r = applyMasteryEvidence(
      state,
      evidence({ correct: true, difficulty: "easy" }),
    );
    expect(r.next.status).not.toBe("mastered");
    expect(r.next.mastery).toBeLessThan(0.8);
    expect(r.next.masteryConfidence).toBeLessThan(0.65);
  });

  it("single wrong does not destroy strong mastery", () => {
    let state = seedFromMeasuredLevel("t1", "a", "solid");
    state = {
      ...state,
      mastery: 0.85,
      masteryConfidence: 0.8,
      evidenceCount: 8,
      status: "mastered",
    };
    const before = state.mastery;
    const r = applyMasteryEvidence(
      state,
      evidence({ correct: false, difficulty: "easy" }),
    );
    expect(before - r.next.mastery).toBeLessThanOrEqual(0.12);
    expect(r.next.mastery).toBeGreaterThan(0.7);
  });

  it("independent hard counts more than hinted easy", () => {
    const hard = evidenceStrength(
      evidence({ correct: true, difficulty: "hard", independent: true }),
    );
    const hinted = evidenceStrength(
      evidence({
        correct: true,
        difficulty: "easy",
        independent: false,
        hintUsed: true,
      }),
    );
    expect(hard).toBeGreaterThan(hinted);
  });

  it("delayed retrieval is strong positive evidence", () => {
    const base = evidenceStrength(evidence({ correct: true }));
    const retrieval = evidenceStrength(
      evidence({ correct: true, retrievalAfterDelay: true }),
    );
    expect(retrieval).toBeGreaterThan(base);
  });

  it("high mastery + low confidence is not mastered status", () => {
    expect(
      statusFromMastery({
        mastery: 0.9,
        confidence: 0.4,
        reviewDueAt: null,
        repeatedErrorCount: 0,
        evidenceCount: 3,
      }),
    ).not.toBe("mastered");
  });

  it("advance blocked when confidence low despite mastery", () => {
    const topic = {
      ...emptyTopicMastery("t1", "a"),
      mastery: 0.9,
      masteryConfidence: 0.4,
      evidenceCount: 6,
      independentAccuracy: 0.8,
    };
    const check = canAdvanceTopic({
      topic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.9, status: "developing" }],
        ["prereq", { mastery: 0.8, status: "mastered" }],
      ]),
      independentCount: 4,
      mediumOrHardCorrect: 2,
    });
    expect(check.allowed).toBe(false);
    expect(check.reasons).toContain("confidence_below_threshold");
  });

  it("policy blocks advance when prerequisite unmet even if Jev says advance", () => {
    const topic = {
      ...emptyTopicMastery("t1", "a"),
      mastery: 0.9,
      masteryConfidence: 0.8,
      evidenceCount: 6,
      independentAccuracy: 0.9,
    };
    const decision: JevDecisionResult = {
      provider: "jev",
      action: "advance",
      teachingMode: "concise_explanation",
      difficulty: "medium",
      needsPrerequisiteReview: false,
      readyToAdvance: true,
      needsGpt4o: false,
      needsDailyReplan: false,
      misconceptionSeverity: 0,
      modelRecommendation: "gpt-4o-mini",
      confidence: 0.9,
      probabilities: {},
      latencyMs: 10,
    };
    const policy = applyPolicyToDecision({
      decision,
      allowedActions: ["advance", "practice", "prerequisite_review"],
      topic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.9, status: "developing" }],
        ["prereq", { mastery: 0.2, status: "learning" }],
      ]),
    });
    expect(policy.action).not.toBe("advance");
    expect(policy.needsPrerequisiteReview).toBe(true);
  });
});

describe("Plan stability", () => {
  it("one wrong answer never triggers master replan by itself", () => {
    expect(
      shouldReplanMaster({
        trigger: "behind_schedule",
        jevNeedsDailyReplan: true,
        behindBySessions: 0,
      }),
    ).toBe(false);
  });

  it("daily replan can fire without master replan", () => {
    expect(
      shouldReplanDaily({
        flagEnabled: true,
        jevNeedsDailyReplan: true,
        jevConfidence: 0.8,
        mediumConfidence: 0.65,
        materialBehind: false,
        newReviewDue: false,
      }),
    ).toBe(true);
    expect(
      shouldReplanMaster({
        trigger: "behind_schedule",
        behindBySessions: 1,
      }),
    ).toBe(false);
  });

  it("repeated behind sessions can replan master", () => {
    expect(
      shouldReplanMaster({
        trigger: "behind_schedule",
        behindBySessions: 2,
      }),
    ).toBe(true);
  });
});

describe("Jev decision quality fixtures (policy + normalize)", () => {
  const baseTopic = emptyTopicMastery("t1", "a");

  it("A: high mastery + confidence → advance stays allowed by filter when gates met", () => {
    const topic = {
      ...baseTopic,
      mastery: 0.85,
      masteryConfidence: 0.8,
      evidenceCount: 6,
      independentAccuracy: 0.9,
      status: "developing" as const,
    };
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.85, status: "developing" }],
        ["prereq", { mastery: 0.9, status: "mastered" }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: true,
      repeatedMisconception: false,
    });
    expect(allowed).toContain("advance");
  });

  it("B: low mastery + repeated misconception → worked_example/reteach in allowlist", () => {
    const topic = {
      ...baseTopic,
      mastery: 0.25,
      repeatedErrorCount: 3,
      misconceptionFlags: ["enerji"],
    };
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.25, status: "learning" }],
        ["prereq", { mastery: 0.9, status: "mastered" }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: false,
      repeatedMisconception: true,
    });
    expect(allowed.some((a) => a === "reteach" || a === "worked_example" || a === "easier_example")).toBe(
      true,
    );
  });

  it("C: prerequisite gap → prerequisite_review", () => {
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic: baseTopic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.1, status: "unseen" }],
        ["prereq", { mastery: 0.1, status: "unseen" }],
      ]),
      reviewDue: false,
      lastAnswerCorrect: null,
      repeatedMisconception: false,
    });
    expect(allowed).toContain("prerequisite_review");
    expect(allowed).not.toContain("advance");
  });

  it("D: review due → scheduled_review", () => {
    const topic = {
      ...baseTopic,
      mastery: 0.8,
      masteryConfidence: 0.7,
      evidenceCount: 5,
      reviewDueAt: new Date(Date.now() - 1000).toISOString(),
      status: "review_due" as const,
    };
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 20,
      topic,
      graph,
      masteryByKey: new Map([
        ["a", { mastery: 0.8, status: "review_due" }],
        ["prereq", { mastery: 0.9, status: "mastered" }],
      ]),
      reviewDue: true,
      lastAnswerCorrect: null,
      repeatedMisconception: false,
    });
    expect(allowed).toContain("scheduled_review");
  });

  it("E: 2 minutes left → no long teach", () => {
    const allowed = filterCandidateActions({
      sessionMinutesRemaining: 2,
      topic: baseTopic,
      graph,
      masteryByKey: new Map(),
      reviewDue: false,
      lastAnswerCorrect: null,
      repeatedMisconception: false,
    });
    expect(allowed).not.toContain("teach");
  });

  it("normalize clamps external action into allowlist", () => {
    const r = normalizeDecisionPayload(
      { next_action: "advance", teaching_mode: "socratic", difficulty: "hard" },
      {
        allowedActions: ["worked_example", "reteach"],
        provider: "jev",
        latencyMs: 5,
      },
    );
    expect(["worked_example", "reteach"]).toContain(r.action);
  });
});

describe("Daily plan builder", () => {
  it("includes due reviews and caps minutes without dumping all missed work", () => {
    const built = buildDailyPlanItems({
      userId: "u",
      examPrepId: "p",
      schedule: {
        fits: true,
        availableMinutes: 60,
        requiredMinutes: 60,
        cutTopicIds: [],
        optionsIfTight: [],
        studyDayDates: [],
        orderedTopicIds: [],
        summary: "",
        sessions: [
          {
            topicId: "t1",
            topicTitle: "First law",
            calendarDate: "2099-01-01",
            role: "learn",
            durationMinutes: 40,
            sourcePages: [],
          },
          {
            topicId: "t2",
            topicTitle: "Open systems",
            calendarDate: "2099-01-01",
            role: "practice",
            durationMinutes: 40,
            sourcePages: [],
          },
        ],
      } as never,
      reviewItems: [
        { topicKey: "first-law", title: "First law", minutes: 8 },
      ],
      weakTopics: [{ topicKey: "props", title: "Properties" }],
      dailyMinutesCap: 60,
      masterPlanVersion: 1,
      planDate: "2099-01-01",
    });
    expect(built.items.some((i) => i.kind === "review")).toBe(true);
    expect(built.estimatedMinutes).toBeLessThanOrEqual(60);
  });
});

describe("Deterministic answer evaluation", () => {
  it("grades MCQ without LLM", () => {
    const r = deterministicGrade(
      {
        id: "q1",
        prompt: "x?",
        format: "mcq",
        choices: ["A", "B", "C"],
        correctAnswer: "B",
      },
      "B",
    );
    expect(r?.correct).toBe(true);
  });

  it("grades numeric with tolerance", () => {
    const r = deterministicGrade(
      {
        id: "q2",
        prompt: "n?",
        format: "numeric",
        correctAnswer: "100",
      },
      "101",
    );
    expect(r?.correct).toBe(true);
  });
});

describe("buildDecisionState compactness", () => {
  it("includes allowed actions from filter", () => {
    const state = buildDecisionState({
      examDaysRemaining: 21,
      sessionMinutesRemaining: 60,
      topic: emptyTopicMastery("t", "thermo"),
      lastAnswerCorrect: false,
      hintCount: 0,
      repeatedMisconception: true,
      todayTarget: "First law",
      behindSchedule: false,
      allowedActions: ["worked_example", "reteach"],
      candidateTopics: [{ topic_id: "t", priority: 1 }],
    });
    expect(state.allowed_actions).toEqual(["worked_example", "reteach"]);
  });
});
