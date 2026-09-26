import { describe, expect, it } from "vitest";
import {
  breakActionLoop,
  escalateTeachingMode,
  filterCandidateActions,
  canAdvanceTopic,
} from "@/lib/adaptive/policy-engine";
import {
  examPhaseFromDays,
  filterActionsForExamPhase,
} from "@/lib/adaptive/exam-phase";
import {
  stabilizeReadiness,
  computeAdaptiveReadiness,
  READINESS_DEADBAND,
} from "@/lib/adaptive/readiness";
import { prioritizeTopics } from "@/lib/adaptive/priority";
import {
  questionFingerprint,
  isNearDuplicateQuestion,
} from "@/lib/adaptive/action-content/generate-action-content";
import { emptyTopicMastery } from "@/lib/adaptive/mastery-engine";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import type { LearningAction } from "@/lib/adaptive/types";

const graph: ExamGraph = {
  examPrepId: "p1",
  topics: [
    {
      topicId: "t1",
      topicKey: "bayes",
      title: "Bayes",
      importance: "important",
      weightPercent: 20,
      measuredLevel: null,
      prerequisites: [],
      pageNumbers: [],
      sourceRefs: [],
      documentTopicNodeId: null,
    },
    {
      topicId: "t2",
      topicKey: "clt",
      title: "CLT",
      importance: "less",
      weightPercent: 5,
      measuredLevel: null,
      prerequisites: ["bayes"],
      pageNumbers: [],
      sourceRefs: [],
      documentTopicNodeId: null,
    },
  ],
  edges: [{ fromKey: "bayes", toKey: "clt", kind: "prerequisite" }],
};

describe("Phase3 anti-loop", () => {
  it("breaks three identical action+topic without progress", () => {
    const { allowed, forced } = breakActionLoop({
      allowed: ["reteach", "worked_example", "practice"],
      recent: [
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
      ],
      topicKey: "bayes",
      progressMade: false,
    });
    expect(forced).not.toBe("reteach");
    expect(forced).toBeTruthy();
    expect(allowed[0]).toBe(forced);
    expect(allowed.includes("reteach")).toBe(false);
  });

  it("does not break when progress was made", () => {
    const { forced } = breakActionLoop({
      allowed: ["reteach", "practice"],
      recent: [
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
      ],
      topicKey: "bayes",
      progressMade: true,
    });
    expect(forced).toBeNull();
  });

  it("escalates teaching mode after repeated errors", () => {
    expect(escalateTeachingMode("concise_explanation", 0)).toBe(
      "concise_explanation",
    );
    expect(escalateTeachingMode("concise_explanation", 2)).not.toBe(
      "concise_explanation",
    );
    expect(escalateTeachingMode("step_by_step", 3)).toBe("analogy");
  });

  it("filterCandidateActions applies anti-loop", () => {
    const topic = {
      ...emptyTopicMastery("t1", "bayes"),
      mastery: 0.4,
      evidenceCount: 3,
      repeatedErrorCount: 2,
    };
    const out = filterCandidateActions({
      sessionMinutesRemaining: 40,
      topic,
      graph,
      masteryByKey: new Map([["bayes", { mastery: 0.4, status: "learning" }]]),
      reviewDue: false,
      lastAnswerCorrect: false,
      repeatedMisconception: true,
      recentActions: [
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
        { action: "reteach", topicKey: "bayes" },
      ],
      progressMade: false,
    });
    expect(out[0]).not.toBe("reteach");
  });
});

describe("Phase3 exam phase", () => {
  it("maps days to learn/mixed/cram", () => {
    expect(examPhaseFromDays(20)).toBe("learn");
    expect(examPhaseFromDays(7)).toBe("mixed");
    expect(examPhaseFromDays(2)).toBe("cram");
  });

  it("cram filters out major new teach when mastery ok", () => {
    const actions: LearningAction[] = [
      "teach",
      "practice",
      "retrieval_practice",
      "scheduled_review",
    ];
    const filtered = filterActionsForExamPhase(actions, "cram", 0.6);
    expect(filtered.includes("teach")).toBe(false);
    expect(filtered.includes("scheduled_review")).toBe(true);
  });

  it("near-exam prioritizes reviews over low-weight new topics", () => {
    const topics = [
      {
        ...emptyTopicMastery("t1", "bayes"),
        mastery: 0.4,
        reviewDueAt: new Date(Date.now() - 1000).toISOString(),
      },
      {
        ...emptyTopicMastery("t2", "clt"),
        mastery: 0.1,
      },
    ];
    const cram = prioritizeTopics({
      graph,
      topics,
      daysRemaining: 2,
    });
    expect(cram[0]?.topicKey).toBe("bayes");
  });
});

describe("Phase3 readiness deadband", () => {
  it("does not jump ~20 points on one small change", () => {
    const stable = stabilizeReadiness(81, 58);
    expect(Math.abs(stable - 58)).toBeLessThan(20);
    expect(stable).toBeLessThan(70);
  });

  it("holds within deadband", () => {
    expect(stabilizeReadiness(59, 58)).toBe(58);
    expect(READINESS_DEADBAND).toBeGreaterThanOrEqual(3);
  });

  it("computeAdaptiveReadiness returns raw + stabilized", () => {
    const topics = [
      { ...emptyTopicMastery("t1", "bayes"), mastery: 0.6, masteryConfidence: 0.5, evidenceCount: 3 },
    ];
    const r = computeAdaptiveReadiness({
      topics,
      importanceByKey: new Map([["bayes", 1]]),
      daysRemaining: 20,
      overdueReviews: 0,
      coveragePct: 50,
      behindSchedule: false,
      previousReadinessPct: 58,
    });
    expect(r.rawReadinessPct).toBeGreaterThanOrEqual(0);
    expect(Math.abs(r.readinessPct - 58)).toBeLessThan(15);
  });
});

describe("Phase3 advance still policy-gated", () => {
  it("blocks advance despite high mastery without evidence", () => {
    const topic = {
      ...emptyTopicMastery("t1", "bayes"),
      mastery: 0.9,
      masteryConfidence: 0.9,
      evidenceCount: 1,
    };
    const check = canAdvanceTopic({
      topic,
      graph,
      masteryByKey: new Map([["bayes", { mastery: 0.9, status: "developing" }]]),
    });
    expect(check.allowed).toBe(false);
    expect(check.reasons).toContain("insufficient_evidence");
  });
});

describe("Phase3 question fingerprint", () => {
  it("normalizes numbers for near-duplicate detection", () => {
    const a = questionFingerprint("P(A|B) = 0.3 iken ne olur?");
    const b = questionFingerprint("P(A|B) = 0.7 iken ne olur?");
    expect(a).toBe(b);
    expect(isNearDuplicateQuestion("P(A|B) = 0.9 iken ne olur?", [a])).toBe(
      true,
    );
  });
});
