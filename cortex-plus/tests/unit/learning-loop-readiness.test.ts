import { describe, expect, it } from "vitest";
import {
  buildLearningIndicators,
  extractAnswerEvidence,
  foldTopicMastery,
  preferNextNodeForTracking,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { buildReadinessScreen } from "@/lib/learning/readiness-screen";
import { buildLocalSessionPayload } from "@/lib/learning/exam-local-session";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { fakeSupabase, has, type FakeCall, type FakeResult } from "./helpers/query-recorder";

/*
  "Hazırsın" (25 Ekim 2026, ürün sahibinin kararı; 20 Ekim kuralının yerine): yazılı deneme ya da
  genel hazırlık skoru (her planlı konu ölçülmüşken) hedefe ulaştıysa Hazırsın. Konu "Sağlam" =
  doğruluğu hedefte ya da üstünde. Yüzde dürüst kalır: açık yanılgı tavanı (85) yerinde.
*/
const READY = "🎉 Sınava Hazırsın! Hedefini Başarıyla Geçtin";

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

describe("Hazırsın: deneme ya da genel skor hedefi geçtiyse", () => {
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

  it("açık yanılgı varken deneme hedefi geçtiyse yine Hazırsın; yüzde tavanı yerinde", () => {
    const indicators = buildLearningIndicators({
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç"],
      openMisconceptions: 1,
      mockScorePct: 80,
      targetScore: 70,
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(true);
    expect(indicators.examReadiness.pct).toBeLessThanOrEqual(85);
  });

  it("deneme hedefin altında ya da çözülmemişse genel skor karar verir", () => {
    for (const mockScorePct of [60, null]) {
      const strong = buildLearningIndicators({
        nodes: allDone,
        topics: [topic({ topicKey: "basınç" })],
        plannedTopicKeys: ["Basınç"],
        openMisconceptions: 0,
        mockScorePct,
        targetScore: 70,
      });
      expect(strong.examReadiness.claimFullyReady).toBe(true);
      expect(strong.examReadiness.pct).toBeGreaterThanOrEqual(70);
      const weak = buildLearningIndicators({
        nodes: allDone,
        topics: [topic({ topicKey: "basınç", independentCorrect: 5, firstAttemptCorrect: 5, level: "weak", confidence: 50 })],
        plannedTopicKeys: ["Basınç"],
        openMisconceptions: 0,
        mockScorePct,
        targetScore: 70,
      });
      expect(weak.examReadiness.claimFullyReady).toBe(false);
      expect(weak.examReadiness.pct).toBeLessThan(70);
    }
  });

  it("ölçülmemiş planlı konu varken genel skor Hazırsın demez; deneme hedefi geçerse der", () => {
    const partial = {
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç", "Sıcaklık", "Hacim", "Kaldırma", "Akışkan"],
      openMisconceptions: 0,
      targetScore: 70,
    };
    expect(buildLearningIndicators({ ...partial, mockScorePct: null }).examReadiness.claimFullyReady).toBe(false);
    expect(buildLearningIndicators({ ...partial, mockScorePct: 89 }).examReadiness.claimFullyReady).toBe(false);
    expect(buildLearningIndicators({ ...partial, mockScorePct: 89 }).examReadiness.pct).toBeLessThan(62);
  });

  it("%89 deneme, %80 hedef: ekran Hazırsın der, düşük konu 'Çalışılacak', diğerleri 'Sağlam'", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Basınç", "Sıcaklık"],
      mastery: [
        topic({ topicKey: "basınç" }),
        topic({ topicKey: "sıcaklık", independentCorrect: 6, firstAttemptCorrect: 6, level: "emerging", confidence: 60 }),
      ],
      openMissesByTopic: [{ topic: "Basınç", count: 1 }],
      mockScorePct: 89,
      targetScore: 80,
      nodes: allDone,
      links: { focused: "/odak", written: "/deneme", quiz: "/test", home: "/ev" },
    });
    expect(screen.ready).toBe(false);
    expect(screen.headline).not.toBe(READY);
    expect(screen.lead.length).toBeGreaterThan(0);
    expect(screen.topics.find((row) => row.topic === "Basınç")?.state).toBe("ready");
    expect(screen.topics.find((row) => row.topic === "Basınç")?.detail).toContain("1 açık yanlış");
    expect(screen.topics.find((row) => row.topic === "Sıcaklık")?.state).toBe("needs_work");
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

/*
  22 Ekim 2026 (inceleme bulgusu): hazırlık değerlendirme düğümü deneme puanını son 40 etkinliğin
  içinde arıyordu. Deneme zorunlu olunca, erken çözülen deneme 40 etkinlikten sonra pencereden
  düşüyor, ekran "Yazılı denemeyi çöz" diyordu — /degerlendirme ise çözüldü diyordu. Puan artık
  bitmiş "Yazılı deneme" düğümünün son kaydından okunur; pencere yalnız kaçırılan sorular için.
*/
describe("Hazırsın ekranı: deneme puanı 40'lık pencereden değil, düğümün kaydından", () => {
  const prep = { userId: "u1", prepId: "p1", prepTitle: "Fizik", targetScore: 70, learningPreferences: null };
  const nodes = (withMockDone: boolean) => [
    { id: "n-lesson", kind: "lesson", status: "done", session_meta: { topicTitle: "Basınç" } },
    { id: "n-mock", kind: "written_exam", status: withMockDone ? "done" : "ready", session_meta: null },
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `n-quiz-${i}`,
      kind: "quiz",
      status: "done",
      session_meta: { topicTitle: "Basınç" },
    })),
  ];
  // 40 yeni test kaydı: deneme kaydı pencerenin dışında kaldı.
  const windowAttempts = Array.from({ length: 40 }, (_, i) => ({
    node_id: `n-quiz-${i}`,
    payload: { type: "quiz", questions: [] },
    answers: {},
    score: 5,
    total: 5,
    status: "completed",
  }));
  const screenOf = (plan: Awaited<ReturnType<typeof buildLocalSessionPayload>>) => {
    if (plan.action !== "serve") throw new Error("serve bekleniyordu");
    return plan.payload.screen as { mockLine: string; ready: boolean; actions: { label: string }[] };
  };
  const handler =
    (withMockDone: boolean) =>
    (call: FakeCall): FakeResult | undefined => {
      if (call.table === "exam_prep_topics") return { data: [{ id: "t1", label: "Basınç" }] };
      if (call.table === "exam_prep_topic_mastery") {
        return {
          data: [
            {
              topic_key: "basınç",
              measured_level: "solid",
              confidence: 90,
              evidence_count: 10,
              first_attempt_correct: 9,
              first_attempt_total: 10,
              independent_correct: 9,
              independent_total: 10,
              last_practiced_at: "2026-10-18T09:00:00.000Z",
            },
          ],
        };
      }
      if (call.table === "exam_prep_misconceptions") return { data: [] };
      if (call.table === "exam_prep_nodes") return { data: nodes(withMockDone) };
      if (call.table === "exam_prep_lessons") return { data: [] };
      if (call.table === "exam_prep_node_attempts") {
        if (has(call, "eq", "node_id", "n-mock")) return { data: { score: 8, total: 10 } };
        return { data: windowAttempts };
      }
      return undefined;
    };

  it("deneme 40 etkinlik önce çözülmüşse puan yine görünür, 'Yazılı denemeyi çöz' çıkmaz", async () => {
    const fake = fakeSupabase(handler(true));
    const plan = await buildLocalSessionPayload(fake.service as never, { ...prep, kind: "readiness" });
    expect(plan.action).toBe("serve");
    const screen = screenOf(plan);
    expect(screen.mockLine).toContain("%80");
    expect(screen.actions.map((action) => action.label)).not.toContain("Yazılı denemeyi çöz");
    const direct = fake.calls.find((call) => call.table === "exam_prep_node_attempts" && has(call, "eq", "node_id", "n-mock"));
    expect(direct?.columns).toBe("score, total");
    expect(has(direct!, "eq", "status", "completed")).toBe(true);
    expect(has(direct!, "limit", 1)).toBe(true);
  });

  it("deneme düğümü bitmemişse ek sorgu yok, ekran denemeyi ister", async () => {
    const fake = fakeSupabase(handler(false));
    const plan = await buildLocalSessionPayload(fake.service as never, { ...prep, kind: "readiness" });
    const screen = screenOf(plan);
    expect(screen.mockLine).toBe("Yazılı deneme henüz çözülmedi.");
    expect(screen.actions.map((action) => action.label)).toContain("Yazılı denemeyi çöz");
    expect(fake.calls.filter((call) => call.table === "exam_prep_node_attempts")).toHaveLength(1);
  });

  // 22 Ekim 2026 inceleme.
  it("açık yanılgı sayısı okunamadıysa yüzde 85'i geçmez; deneme hedefi geçtiyse karar Hazırsın", () => {
    const indicators = buildLearningIndicators({
      nodes: allDone,
      topics: [topic({ topicKey: "basınç" })],
      plannedTopicKeys: ["Basınç"],
      openMisconceptions: 0,
      openMisconceptionsKnown: false,
      mockScorePct: 80,
      targetScore: 70,
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(true);
    expect(indicators.examReadiness.pct).toBeLessThanOrEqual(85);
  });

  it("hedef girilmemişse ekran %70'i söyler ve hedef altındaki denemeyi gösterir", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Basınç"],
      mastery: [topic({ topicKey: "basınç" })],
      openMissesByTopic: [],
      mockScorePct: 65,
      targetScore: null,
      nodes: allDone,
      links: { written: "/w", home: "/h" },
    });
    expect(screen.mockLine).toContain("Hedef %70");
    expect(screen.actions.map((action) => action.label)).toContain("Deneme hedefin altında (%65). Bir tur daha çöz");
  });

  it("bilgi boşlukları: yanılgı okuması düşerse 'boşluk yok' denmez, istek düşer", async () => {
    const fake = fakeSupabase((call) =>
      call.table === "exam_prep_misconceptions" ? { error: { code: "57014", message: "timeout" } } : handler(true)(call),
    );
    await expect(buildLocalSessionPayload(fake.service as never, { ...prep, kind: "gaps" })).rejects.toThrow("tracking_read_failed");
  });

  it("değerlendirme: toplam açık yanılgı sayısı bütün satırlardan; okunamazsa istek düşer", async () => {
    const isCount = (call: FakeCall) => call.table === "exam_prep_misconceptions" && Boolean((call.options as { head?: boolean } | undefined)?.head);
    const counted = fakeSupabase((call) => (isCount(call) ? { count: 3 } : handler(true)(call)));
    const plan = await buildLocalSessionPayload(counted.service as never, { ...prep, kind: "readiness" });
    expect(screenOf(plan).actions.map((action) => action.label)).not.toContain("Yazılı denemeyi çöz");
    // Deneme %80, hedef %70: 3 açık yanılgı kararı değiştirmez.
    expect(screenOf(plan).ready).toBe(true);
    const failing = fakeSupabase((call) => (isCount(call) ? { error: { code: "57014", message: "timeout" } } : handler(true)(call)));
    await expect(buildLocalSessionPayload(failing.service as never, { ...prep, kind: "readiness" })).rejects.toThrow("tracking_read_failed");
  });
});
