import { describe, expect, it } from "vitest";
import {
  buildLearningIndicators,
  extractAnswerEvidence,
  foldTopicMastery,
  preferNextNodeForTracking,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/*
  Öğrenme döngüsü (20 Ekim 2026, ürün sahibinin kararı): "Hazırsın" düzelmiş hata yüzünden
  kapanmaz. Her planlı konu sağlam (%85+, en az 3 öğe), açık yanılgı yok, yazılı deneme hedefte ya
  da üstünde, kapsam %100 → Hazırsın. Yüzde dürüst kalır (%90'da da Hazırsın görünebilir).
*/

function topic(partial: Partial<TopicMasterySnapshot> & { topicKey: string }): TopicMasterySnapshot {
  return {
    measured: true,
    level: "solid",
    confidence: 90,
    evidenceCount: 10,
    firstAttemptCorrect: 9,
    firstAttemptTotal: 10,
    independentCorrect: 9,
    independentTotal: 10,
    lastPracticedAt: "2026-10-18T09:00:00.000Z",
    ...partial,
  };
}

const done = (kinds: PlanNodeKind[]) => kinds.map((kind) => ({ kind, status: "done" as const }));
const allDone = done(["lesson", "quiz", "written_exam", "flashcards", "final_check"]);

describe("Hazırsın: düzelmiş hata kapatmaz, açık hata kapatır", () => {
  it("10 cevaptan 9'u doğru, açık yanılgı yok, deneme hedefte → Hazırsın, yüzde %90'ı geçmez", () => {
    const indicators = buildLearningIndicators({
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç"],
      openMisconceptions: 0,
      mockScorePct: 80,
      targetScore: 70,
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(true);
    expect(indicators.examReadiness.pct).toBeLessThanOrEqual(90);
    expect(indicators.examReadiness.pct).toBeGreaterThan(80);
  });

  it("açık bir yanılgı Hazırsın'ı kapatır", () => {
    const indicators = buildLearningIndicators({
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç"],
      openMisconceptions: 1,
      mockScorePct: 80,
      targetScore: 70,
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
    expect(indicators.examReadiness.pct).toBeLessThanOrEqual(85);
  });

  it("deneme hedefin altında ya da hiç çözülmemişse Hazırsın yok", () => {
    for (const mockScorePct of [60, null]) {
      const indicators = buildLearningIndicators({
        nodes: allDone,
        topics: [topic({ topicKey: "basınç" })],
        plannedTopicKeys: ["Basınç"],
        openMisconceptions: 0,
        mockScorePct,
        targetScore: 70,
      });
      expect(indicators.examReadiness.claimFullyReady).toBe(false);
      expect(indicators.examReadiness.pct).toBeLessThan(100);
    }
  });

  it("bir planlı konu sağlam değilse ya da ölçülmemişse Hazırsın yok", () => {
    const emerging = buildLearningIndicators({
      nodes: allDone,
      topics: [
        topic({ topicKey: "basınç" }),
        topic({ topicKey: "sıcaklık", level: "emerging", independentCorrect: 7, firstAttemptCorrect: 7, confidence: 70 }),
      ],
      plannedTopicKeys: ["Basınç", "Sıcaklık"],
      openMisconceptions: 0,
      mockScorePct: 90,
      targetScore: 70,
    });
    expect(emerging.examReadiness.claimFullyReady).toBe(false);
    const unmeasured = buildLearningIndicators({
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç", "Sıcaklık"],
      openMisconceptions: 0,
      mockScorePct: 90,
      targetScore: 70,
    });
    expect(unmeasured.examReadiness.claimFullyReady).toBe(false);
  });

  it("hazırlık ekranı: çözülmüş yanlışları olan sağlam konu 'hazır'; açık yanlış 'çalışılacak'", () => {
    const base = {
      plannedTopics: ["Basınç"],
      mastery: [topic({ topicKey: "basınç" })],
      mockScorePct: 80,
      targetScore: 70,
      nodes: allDone,
      links: { focused: "/odak", written: "/deneme", quiz: "/test", home: "/ev" },
    };
    const ready = buildReadinessScreen({ ...base, openMissesByTopic: [] });
    expect(ready.topics[0].state).toBe("ready");
    expect(ready.headline).toBe("Hazırsın");
    const open = buildReadinessScreen({ ...base, openMissesByTopic: [{ topic: "Basınç", count: 1 }] });
    expect(open.topics[0].state).toBe("needs_work");
    expect(open.headline).not.toBe("Hazırsın");
    expect(open.topics[0].detail).toContain("1 açık yanlış");
  });
});

describe("yazılı deneme kanıtı", () => {
  it("her soru kendi konusuna; kısmi ve boş doğru sayılmaz; yardım yok", () => {
    const evidence = extractAnswerEvidence({
      kind: "written_exam",
      payload: {
        type: "mock_exam",
        practiceExamId: "e1",
        practiceAttemptId: "pa1",
        items: [
          { topic: "Basınç", verdict: "dogru", correct: true },
          { topic: "Sıcaklık", verdict: "kismen", correct: false },
          { topic: "Sıcaklık", verdict: "bos", correct: false },
        ],
      },
      answers: {},
      topicLabel: null,
      isFirstAttempt: true,
    });
    expect(evidence).toHaveLength(3);
    expect(evidence.map((row) => row.topicKey)).toEqual(["basınç", "sıcaklık", "sıcaklık"]);
    expect(evidence.every((row) => row.sourceKind === "written_exam" && !row.hintAssisted)).toBe(true);
    expect(evidence.map((row) => row.correct)).toEqual([true, false, false]);
    expect(evidence[2].wrongType).toBe("mock_blank");
    expect(evidence[1].wrongType).toBe("mock_miss");
    const folded = foldTopicMastery(evidence);
    expect(folded.find((row) => row.topicKey === "basınç")?.independentCorrect).toBe(1);
    expect(folded.find((row) => row.topicKey === "sıcaklık")?.independentTotal).toBe(2);
  });

  it("zayıf konuya yönelen içerik (testedTopic) kanıtı o konuya yazar", () => {
    const evidence = extractAnswerEvidence({
      kind: "gaps",
      payload: {
        type: "quiz",
        testedTopic: "Basınç",
        questions: [{ text: "s1", options: ["A", "B"], correct: ["A"], multi: false }],
      },
      answers: { "0": "A" },
      topicLabel: "İlk konu",
      isFirstAttempt: true,
    });
    expect(evidence[0].topicKey).toBe("basınç");
  });
});

describe("Devam et yolun penceresinde kalır", () => {
  const node = (id: string, kind: PlanNodeKind, sortOrder: number) => ({
    id,
    kind,
    status: "ready" as const,
    sortOrder,
    sessionMeta: { topicTitle: "Basınç" },
  });

  it("erken açılan son kartlar 'Devam et'i sınav gününe atlatmaz", () => {
    const next = preferNextNodeForTracking([node("lesson", "lesson", 10), node("cards", "flashcards", 90)], {
      openMisconceptions: 3,
      weakOrStaleTopicKeys: ["basınç"],
    });
    expect(next?.id).toBe("lesson");
  });

  it("pencere içindeki tekrar adımı öne alınır, pencere dışındaki alınmaz", () => {
    const near = preferNextNodeForTracking([node("lesson", "lesson", 10), node("gaps", "gaps", 12)], {
      openMisconceptions: 1,
      weakOrStaleTopicKeys: [],
    });
    expect(near?.id).toBe("gaps");
    const far = preferNextNodeForTracking([node("lesson", "lesson", 10), node("gaps", "gaps", 20)], {
      openMisconceptions: 1,
      weakOrStaleTopicKeys: [],
    });
    expect(far?.id).toBe("lesson");
  });

  it("son kartların sırası gelmişse açılır", () => {
    const next = preferNextNodeForTracking([node("cards", "flashcards", 90), node("final", "final_check", 91)], {
      openMisconceptions: 2,
      weakOrStaleTopicKeys: [],
    });
    expect(next?.id).toBe("cards");
  });
});
