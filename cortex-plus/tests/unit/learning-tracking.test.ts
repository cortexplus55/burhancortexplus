import { describe, expect, it } from "vitest";
import {
  buildLearningIndicators,
  computeExamReadiness,
  extractAnswerEvidence,
  foldTopicMastery,
  preferNextNodeForTracking,
  scoreTopicMastery,
  stripAnswerMeta,
  weakOrStaleTopicKeys,
} from "@/lib/learning/learning-tracking";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

describe("learning-tracking Stage 6", () => {
  it("binds quiz answers to topic + learning objective with first/hint flags", () => {
    const evidence = extractAnswerEvidence({
      kind: "quiz",
      topicLabel: "Trigonometri",
      sessionObjective: "Birim çemberi tanı",
      isFirstAttempt: true,
      hintsUsed: { "1": true },
      answers: { "0": "A", "1": "B" },
      payload: {
        type: "quiz",
        questions: [
          {
            text: "sin 90°?",
            options: ["A", "B"],
            correct: ["A"],
            multi: false,
            learningObjective: "sin 90 değerini bil",
          },
          {
            text: "cos 0°?",
            options: ["A", "B"],
            correct: ["A"],
            multi: false,
            misconceptionTag: "cos_sin_swap",
          },
        ],
      },
    });

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      topicKey: "trigonometri",
      learningObjective: "sin 90 değerini bil",
      correct: true,
      isFirstAttempt: true,
      hintAssisted: false,
      independentSuccess: true,
    });
    expect(evidence[1]).toMatchObject({
      correct: false,
      hintAssisted: true,
      independentSuccess: false,
      wrongType: "cos_sin_swap",
    });
  });

  it("does not claim 100% readiness when all activities done with wrongs", () => {
    const nodes = Array.from({ length: 9 }, (_, i) => ({
      kind: (i === 8 ? "written_exam" : "quiz") as PlanNodeKind,
      status: "done" as const,
    }));

    const topics = foldTopicMastery(
      extractAnswerEvidence({
        kind: "quiz",
        topicLabel: "Trigonometri",
        isFirstAttempt: true,
        answers: { "0": "wrong", "1": "wrong", "2": "wrong" },
        payload: {
          type: "quiz",
          questions: [
            {
              text: "q1",
              options: ["ok", "wrong"],
              correct: ["ok"],
              multi: false,
              learningObjective: "obj1 yeterince uzun",
            },
            {
              text: "q2",
              options: ["ok", "wrong"],
              correct: ["ok"],
              multi: false,
              learningObjective: "obj2 yeterince uzun",
            },
            {
              text: "q3",
              options: ["ok", "wrong"],
              correct: ["ok"],
              multi: false,
              learningObjective: "obj3 yeterince uzun",
            },
          ],
        },
      }),
    );

    const indicators = buildLearningIndicators({
      nodes,
      topics,
      plannedTopicKeys: ["Trigonometri"],
      openMisconceptions: 3,
      mockScorePct: 20,
      targetScore: 70,
    });

    expect(indicators.programProgress.pct).toBe(100);
    expect(indicators.examReadiness.pct).toBeLessThan(100);
    expect(indicators.examReadiness.pct).toBeLessThanOrEqual(25);
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
    expect(indicators.examReadiness.label.toLowerCase()).not.toContain("hazırsın");
  });

  it("keeps unmeasured topics at zero confidence", () => {
    const mastery = scoreTopicMastery({
      topicKey: "logaritma",
      measured: false,
      level: "unmeasured",
      confidence: 99,
      evidenceCount: 0,
      firstAttemptCorrect: 0,
      firstAttemptTotal: 0,
      independentCorrect: 0,
      independentTotal: 0,
      lastPracticedAt: null,
    });
    expect(mastery.confidence).toBe(0);
    expect(mastery.level).toBe("unmeasured");

    const readiness = computeExamReadiness({
      programPct: 100,
      topics: [mastery],
      plannedTopicKeys: ["logaritma", "türev"],
    });
    expect(readiness.pct).toBeLessThan(20);
    expect(readiness.claimFullyReady).toBe(false);
    expect(readiness.components.measuredSuccessPct).toBeNull();
  });

  it("separates retry from first attempt and strips meta keys", () => {
    const retry = extractAnswerEvidence({
      kind: "true_false",
      topicLabel: "Açı",
      isFirstAttempt: false,
      answers: {
        "0": true,
        __meta: { hintsUsed: { "0": true } },
        __hints: { "0": true },
      },
      payload: {
        type: "true_false",
        items: [{ text: "90 diktir", correct: true }],
      },
    });
    expect(retry[0].isFirstAttempt).toBe(false);
    expect(retry[0].hintAssisted).toBe(true);
    expect(retry[0].independentSuccess).toBe(false);

    expect(stripAnswerMeta({ "0": true, __meta: { x: 1 }, __hints: { "0": true } })).toEqual({
      "0": true,
    });
  });

  it("biases next activity toward gaps when misconceptions exist", () => {
    const next = preferNextNodeForTracking(
      [
        {
          id: "a",
          kind: "podcast",
          status: "ready",
          sortOrder: 0,
          sessionMeta: { topicTitle: "Trigonometri" },
        },
        {
          id: "b",
          kind: "gaps",
          status: "ready",
          sortOrder: 1,
          sessionMeta: { topicTitle: "Trigonometri" },
        },
      ],
      { openMisconceptions: 2, weakOrStaleTopicKeys: ["trigonometri"] },
    );
    expect(next?.id).toBe("b");
  });

  it("flags weak and stale topics for re-probe", () => {
    const now = Date.now();
    const keys = weakOrStaleTopicKeys(
      [
        {
          topicKey: "weak-topic",
          measured: true,
          level: "weak",
          confidence: 20,
          evidenceCount: 4,
          firstAttemptCorrect: 1,
          firstAttemptTotal: 4,
          independentCorrect: 1,
          independentTotal: 4,
          lastPracticedAt: new Date(now).toISOString(),
        },
        {
          topicKey: "stale-topic",
          measured: true,
          level: "solid",
          confidence: 90,
          evidenceCount: 5,
          firstAttemptCorrect: 5,
          firstAttemptTotal: 5,
          independentCorrect: 5,
          independentTotal: 5,
          lastPracticedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          topicKey: "fresh-solid",
          measured: true,
          level: "solid",
          confidence: 90,
          evidenceCount: 5,
          firstAttemptCorrect: 5,
          firstAttemptTotal: 5,
          independentCorrect: 5,
          independentTotal: 5,
          lastPracticedAt: new Date(now).toISOString(),
        },
      ],
      now,
    );
    expect(keys).toContain("weak-topic");
    expect(keys).toContain("stale-topic");
    expect(keys).not.toContain("fresh-solid");
  });
});
