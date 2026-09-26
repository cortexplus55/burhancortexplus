import { describe, expect, it } from "vitest";
import {
  applyMasteryEvidence,
  discreteLevelFromMastery,
  emptyTopicMastery,
  evidenceStrength,
  seedFromMeasuredLevel,
} from "@/lib/adaptive/mastery-engine";
import { canAdvanceTopic, filterCandidateActions } from "@/lib/adaptive/policy-engine";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import { nextReviewIntervalDays } from "@/lib/adaptive/review-scheduler";
import { classifyKnowledgeGap } from "@/lib/adaptive/knowledge-gap";
import { routeTutorModel } from "@/lib/adaptive/tutor-model-router";
import {
  deterministicFallback,
  normalizeDecisionPayload,
} from "@/lib/adaptive/jev/normalize";
import { buildDecisionState } from "@/lib/adaptive/jev/build-decision-state";
import { shouldReplanMaster } from "@/lib/adaptive/replan-policy";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { LearningEvidence } from "@/lib/adaptive/types";

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

describe("MasteryEngine", () => {
  it("updates mastery smoothly and bounds delta", () => {
    let state = emptyTopicMastery("t1", "termodinamik");
    for (let i = 0; i < 5; i += 1) {
      const r = applyMasteryEvidence(state, evidence({ correct: true }));
      expect(Math.abs(r.delta)).toBeLessThanOrEqual(0.12);
      state = r.next;
    }
    expect(state.mastery).toBeGreaterThan(0.2);
    expect(state.mastery).toBeLessThan(0.9);
    expect(state.evidenceCount).toBe(5);
  });

  it("wrong answers produce negative evidence", () => {
    const state = seedFromMeasuredLevel("t1", "x", "emerging");
    const r = applyMasteryEvidence(
      state,
      evidence({ correct: false, misconceptionTag: "enerji" }),
    );
    expect(r.strength).toBeLessThan(0);
    expect(r.next.mastery).toBeLessThan(state.mastery);
  });

  it("maps discrete levels", () => {
    expect(discreteLevelFromMastery(0, 0)).toBe("unmeasured");
    expect(discreteLevelFromMastery(0.2, 2)).toBe("weak");
    expect(discreteLevelFromMastery(0.55, 3)).toBe("emerging");
    expect(discreteLevelFromMastery(0.8, 4)).toBe("solid");
  });

  it("hint and retry reduce positive strength", () => {
    const base = evidenceStrength(evidence({ correct: true }));
    const hinted = evidenceStrength(
      evidence({ correct: true, hintUsed: true }),
    );
    expect(hinted).toBeLessThan(base);
  });
});

describe("PolicyEngine advance gate", () => {
  const graph: ExamGraph = {
    examPrepId: "p1",
    topics: [
      {
        topicId: "t1",
        topicKey: "a",
        title: "A",
        prerequisites: [],
        importance: "medium",
        weightPercent: null,
        pageNumbers: [],
        sourceRefs: [],
        documentTopicNodeId: null,
        measuredLevel: null,
      },
    ],
    edges: [],
  };

  it("blocks advance without evidence", () => {
    const topic = emptyTopicMastery("t1", "a");
    const check = canAdvanceTopic({
      topic,
      graph,
      masteryByKey: new Map([["a", { mastery: 0, status: "unseen" }]]),
    });
    expect(check.allowed).toBe(false);
    expect(check.reasons.length).toBeGreaterThan(0);
  });

  it("filters advance when session time is short", () => {
    const topic = emptyTopicMastery("t1", "a");
    const actions = filterCandidateActions({
      sessionMinutesRemaining: 3,
      topic,
      graph,
      masteryByKey: new Map(),
      reviewDue: false,
      lastAnswerCorrect: null,
      repeatedMisconception: false,
    });
    expect(actions).not.toContain("teach");
    expect(actions).not.toContain("advance");
  });
});

describe("priority shortlist", () => {
  it("returns at most 5 candidates preferring low mastery", () => {
    const graph: ExamGraph = {
      examPrepId: "p",
      topics: Array.from({ length: 8 }, (_, i) => ({
        topicId: `t${i}`,
        topicKey: `k${i}`,
        title: `T${i}`,
        prerequisites: [],
        importance: i === 0 ? ("important" as const) : ("medium" as const),
        weightPercent: null,
        pageNumbers: [],
        sourceRefs: [],
        documentTopicNodeId: null,
        measuredLevel: null,
      })),
      edges: [],
    };
    const topics = graph.topics.map((g, i) => ({
      ...emptyTopicMastery(g.topicId, g.topicKey),
      mastery: i === 2 ? 0.1 : 0.8,
    }));
    const ranked = prioritizeTopics({
      graph,
      topics,
      daysRemaining: 20,
    });
    expect(ranked.length).toBeLessThanOrEqual(5);
    expect(ranked[0]?.topicKey).toBe("k2");
  });
});

describe("review scheduler", () => {
  it("shortens interval on failure and caps by exam date", () => {
    const fail = nextReviewIntervalDays({
      currentIntervalDays: 7,
      success: false,
      examDate: null,
    });
    expect(fail.intervalDays).toBeLessThan(7);

    const near = nextReviewIntervalDays({
      currentIntervalDays: 30,
      success: true,
      examDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(near.intervalDays).toBeLessThanOrEqual(1);
  });
});

describe("knowledge gap", () => {
  it("classifies conceptual vs isolated", () => {
    expect(
      classifyKnowledgeGap({
        correct: false,
        hintUsed: false,
        retry: false,
        misconceptionSeverity: 2,
        repeatedErrorCount: 1,
        misconceptionTag: "enerji",
      }),
    ).toBe("conceptual_gap");
    expect(
      classifyKnowledgeGap({
        correct: false,
        hintUsed: false,
        retry: false,
        misconceptionSeverity: 0,
        repeatedErrorCount: 0,
      }),
    ).toBe("isolated_mistake");
  });
});

describe("TutorModelRouter", () => {
  it("defaults to mini", () => {
    const r = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: false,
    });
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.escalated).toBe(false);
  });

  it("ignores jev signal alone", () => {
    const r = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: true,
    });
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.reasons).toContain("JEV_SIGNAL_IGNORED");
  });

  it("escalates on hard visual rule", () => {
    const r = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: false,
      hasComplexVisual: true,
    });
    expect(r.model).toBe("gpt-4o");
    expect(r.escalated).toBe(true);
    expect(r.reasons).toContain("COMPLEX_VISUAL");
  });

  it("escalates on COMPLEX_REASONING", () => {
    const r = routeTutorModel({
      routerEnabled: true,
      jevNeedsGpt4o: false,
      advancedReasoning: true,
    });
    expect(r.model).toBe("gpt-4o");
    expect(r.reasons).toContain("COMPLEX_REASONING");
  });
});

describe("Jev normalize + fallback", () => {
  it("clamps action to allowlist", () => {
    const r = normalizeDecisionPayload(
      { next_action: "hack_the_planet", teaching_mode: "socratic", difficulty: "hard" },
      {
        allowedActions: ["practice", "teach"],
        provider: "jev",
        latencyMs: 10,
      },
    );
    expect(r.action).toBe("practice");
  });

  it("deterministic fallback stays in allowlist", () => {
    const r = deterministicFallback(["teach", "practice"]);
    expect(["teach", "practice"]).toContain(r.action);
    expect(r.provider).toBe("deterministic");
  });
});

describe("buildDecisionState", () => {
  it("stays compact", () => {
    const state = buildDecisionState({
      examDaysRemaining: 24,
      sessionMinutesRemaining: 31,
      topic: emptyTopicMastery("t", "thermo"),
      lastAnswerCorrect: false,
      hintCount: 1,
      repeatedMisconception: true,
      todayTarget: "Birinci yasa",
      behindSchedule: false,
      allowedActions: ["practice", "reteach"],
      candidateTopics: [{ topic_id: "t", priority: 1.2 }],
    });
    expect(state.allowed_actions).toEqual(["practice", "reteach"]);
    expect(JSON.stringify(state).length).toBeLessThan(2000);
  });
});

describe("replan policy", () => {
  it("allows exam date change but not random triggers", () => {
    expect(shouldReplanMaster({ trigger: "exam_date_changed" })).toBe(true);
    expect(
      shouldReplanMaster({ trigger: "missed_days", missedDayCount: 0 }),
    ).toBe(false);
    expect(
      shouldReplanMaster({ trigger: "missed_days", missedDayCount: 2 }),
    ).toBe(true);
  });
});
