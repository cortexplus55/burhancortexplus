import { describe, expect, it } from "vitest";
import { trailMetaLine } from "@/lib/learning/path-trail-label";
import { verifyFlashcard } from "@/lib/learning/question-verifier";
import { validateFlashcardPedagogy } from "@/lib/learning/teaching-standards";
import {
  readinessPercent,
  topicReadinessScore,
  buildReadinessScreen,
} from "@/lib/learning/readiness-screen";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

describe("path trail labels", () => {
  it("omits bare s.1 on multi-topic prep-wide nodes", () => {
    const line = trailMetaLine(
      {
        kind: "flashcards",
        status: "ready",
        sessionMeta: { sourcePages: [1, 2], durationMinutes: 15 },
      },
      { topicCount: 4, cardCount: 12 },
    );
    expect(line).not.toMatch(/s\.1/);
    expect(line).toMatch(/12 kart/);
    expect(line).toMatch(/~4 dk/);
  });

  it("labels readiness without fixed 15 dk", () => {
    const line = trailMetaLine(
      { kind: "readiness", status: "ready", sessionMeta: { durationMinutes: 15 } },
      { topicCount: 3 },
    );
    expect(line).toContain("Hazırsın?");
    expect(line).toContain("eksikler bu ekranda");
    expect(line).toContain("~3 dk");
    expect(line).not.toMatch(/15 dk/);
  });
});

describe("sourced flashcard verification", () => {
  it("keeps chemistry values in source and drops invented ones", () => {
    const source = "Su için M(H₂O) = 18 g/mol. 88 g CO₂ = 2 mol.";
    expect(verifyFlashcard("Suyun mol kütlesi nedir?", "18 g/mol", source)).not.toBeNull();
    expect(verifyFlashcard("Suyun mol kütlesi nedir?", "20 g/mol", source)).toBeNull();
  });

  it("keeps history year in source and drops wrong year", () => {
    const source = "Türkiye Cumhuriyeti 1923 yılında ilan edildi.";
    expect(
      verifyFlashcard("Cumhuriyet hangi yılda ilan edildi?", "1923", source),
    ).not.toBeNull();
    expect(
      verifyFlashcard("Cumhuriyet hangi yılda ilan edildi?", "1922", source),
    ).toBeNull();
  });
});

describe("validateFlashcardPedagogy extensions", () => {
  it("rejects backs longer than 40 words", () => {
    const long = Array.from({ length: 45 }, () => "kelime").join(" ");
    const issues = validateFlashcardPedagogy([
      { front: "Tanım nedir?", back: long, difficulty: "hard" },
      { front: "İkinci?", back: "Kısa", difficulty: "medium" },
      { front: "Üçüncü?", back: "Kısa", difficulty: "easy" },
      { front: "Dördüncü?", back: "Kısa", difficulty: "easy" },
    ]);
    expect(issues.some((i) => i.includes("40 kelime"))).toBe(true);
  });
});

function topic(partial: Partial<TopicMasterySnapshot> & { topicKey: string }): TopicMasterySnapshot {
  return {
    measured: true,
    level: "solid",
    confidence: 100,
    evidenceCount: 3,
    firstAttemptCorrect: 3,
    firstAttemptTotal: 3,
    independentCorrect: 3,
    independentTotal: 3,
    lastPracticedAt: "2026-09-20T00:00:00.000Z",
    ...partial,
  };
}

const links = {
  focused: "/odak",
  written: "/deneme",
  quiz: "/test",
  home: "/ev",
  cards: "/kart",
};
const done = ["lesson", "quiz", "written_exam", "focused", "final_check"].map((kind) => ({
  kind: kind as PlanNodeKind,
  status: "done" as const,
}));

describe("readinessPercent", () => {
  it("weights history topics 40/60", () => {
    const pct = readinessPercent([
      { weightPercent: 40, score: 100, unmeasured: false },
      { weightPercent: 60, score: 50, unmeasured: false },
    ]);
    expect(pct).toBe(70);
  });

  it("zeros unmeasured topics in the weighted sum", () => {
    const pct = readinessPercent([
      { weightPercent: 50, score: 100, unmeasured: false },
      { weightPercent: 50, score: 80, unmeasured: true },
    ]);
    expect(pct).toBe(50);
  });

  it("applies open-miss penalty in topic score", () => {
    const score = topicReadinessScore({
      independentCorrect: 10,
      independentTotal: 10,
      firstAttemptCorrect: 10,
      firstAttemptTotal: 10,
      measured: true,
      evidenceCount: 10,
      mockTopicPct: 100,
      cardMasteryRatio: 1,
      openMisses: 3,
    });
    expect(score).toBe(85);
  });

  it("requires readinessPct and no unmeasured for Hazırsın", () => {
    const ready = buildReadinessScreen({
      plannedTopics: ["Osmanlı", "Cumhuriyet"],
      mastery: [
        topic({ topicKey: "Osmanlı" }),
        topic({ topicKey: "Cumhuriyet" }),
      ],
      openMissesByTopic: [],
      mockScorePct: 100,
      targetScore: 80,
      nodes: done,
      links,
      topicWeights: [
        { topic: "Osmanlı", weightPercent: 40 },
        { topic: "Cumhuriyet", weightPercent: 60 },
      ],
      mockTopicReport: [
        { topicLabel: "Osmanlı", percent: 100 },
        { topicLabel: "Cumhuriyet", percent: 100 },
      ],
      cardMastery: [
        { topic: "Osmanlı", ratio: 1 },
        { topic: "Cumhuriyet", ratio: 1 },
      ],
    });
    expect(ready.headline).toBe("Hazırsın");
    expect(ready.readinessPct).toBeGreaterThanOrEqual(80);
    expect(ready.ready).toBe(true);

    const blocked = buildReadinessScreen({
      plannedTopics: ["Osmanlı", "Cumhuriyet"],
      mastery: [topic({ topicKey: "Osmanlı" })],
      openMissesByTopic: [],
      mockScorePct: 100,
      targetScore: 80,
      nodes: done,
      links,
      topicWeights: [
        { topic: "Osmanlı", weightPercent: 40 },
        { topic: "Cumhuriyet", weightPercent: 60 },
      ],
    });
    expect(blocked.headline).not.toBe("Hazırsın");
    expect(blocked.topics.some((t) => t.state === "unmeasured")).toBe(true);
  });

  it("lists due cards among actions", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Hücre"],
      mastery: [
        topic({
          topicKey: "Hücre",
          level: "weak",
          independentCorrect: 1,
          independentTotal: 4,
          firstAttemptCorrect: 1,
          firstAttemptTotal: 4,
        }),
      ],
      openMissesByTopic: [{ topic: "Hücre", count: 1 }],
      mockScorePct: 40,
      targetScore: 80,
      nodes: done,
      links,
      dueCardCount: 12,
    });
    expect(screen.actions.some((a) => a.label.includes("12 kart"))).toBe(true);
  });
});
