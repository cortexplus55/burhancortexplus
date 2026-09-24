import { describe, expect, it } from "vitest";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

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

const links = { focused: "/odak", written: "/deneme", quiz: "/test", home: "/ev" };
const done = ["lesson", "quiz", "written_exam", "focused", "final_check"].map((kind) => ({
  kind: kind as PlanNodeKind,
  status: "done" as const,
}));

describe("readiness screen", () => {
  it("says Hazırsın only when measured data supports it", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Basınç"],
      mastery: [topic({ topicKey: "Basınç" })],
      openMissesByTopic: [],
      mockScorePct: 100,
      targetScore: 75,
      nodes: done,
      links,
    });
    expect(screen.headline).toBe("Hazırsın");
    expect(screen.ready).toBe(true);
    expect(screen.topics[0].state).toBe("ready");
  });

  it("names what is left instead of claiming ready", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Basınç", "Sıcaklık"],
      mastery: [
        topic({
          topicKey: "Basınç",
          level: "weak",
          independentCorrect: 1,
          independentTotal: 3,
          firstAttemptCorrect: 1,
          firstAttemptTotal: 3,
          confidence: 30,
        }),
      ],
      openMissesByTopic: [{ topic: "Basınç", count: 2 }],
      mockScorePct: 40,
      targetScore: 75,
      nodes: done,
      links,
    });
    expect(screen.headline).not.toBe("Hazırsın");
    expect(screen.ready).toBe(false);
    expect(screen.topics.find((row) => row.topic === "Basınç")?.state).toBe("needs_work");
    expect(screen.topics.find((row) => row.topic === "Sıcaklık")?.state).toBe("unmeasured");
    expect(screen.topics.find((row) => row.topic === "Basınç")?.detail).toContain("3 bağımsız denemeden 1 doğru");
    expect(screen.actions.some((action) => action.href === "/odak")).toBe(true);
    expect(screen.mockLine).toContain("%40");
  });
});
