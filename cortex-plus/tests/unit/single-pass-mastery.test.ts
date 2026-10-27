import { describe, expect, it, vi } from "vitest";
import { splitAnswerSentences, validFirstAnswerErrors } from "@/lib/learning/oral-first-answer";
import { adjustScoredAnswer } from "@/lib/learning/mock-exam/grade";
import { computeExamReadiness } from "@/lib/learning/learning-tracking";
import { sanitizeStudentCopy } from "@/lib/learning/student-copy";
import { teacherQuizLoop } from "@/lib/learning/teacher-quiz-run";
import { buildPrepProgressView } from "@/lib/learning/prep-progress-view";
import { DEFAULT_SHORT, DEFAULT_STANDARD } from "@/lib/learning/mock-exam/types";

const question = (text: string, correct = "12") => ({
  text,
  options: [correct, "9", "15", "18"],
  correct,
  multi: false,
  explanation: "Kurulum doğru kurulunca sonuç bu değerdir.",
  optionWhy: ["Doğru kurulum.", "Eksik terim.", "İşaret hatası.", "Birim karışıklığı."],
  misconceptionTag: "kurulum",
  learningObjective: "Denklemi kurar.",
});

describe("tek geçiş — Elif, Mert, Zeynep", () => {
  it("Elif: doğru sözlü cevap yanlış sayılmaz", () => {
    const errors = validFirstAnswerErrors(
      "Negatif sayılar sıfırın solundadır. Eksi ile eksi çarpımı artıdır.",
      [{ wrong: "Eksi ile eksi çarpımı artıdır", correct: "Eksi ile eksi çarpımı pozitiftir" }],
    );
    expect(errors).toEqual([]);
  });

  it("Mert: II. Mehmed cümlesi bölünmez ve doğru fetih %100 kalır", () => {
    const text = "II. Mehmed İstanbul'u 1453'te fethetti. Osmanlı bu tarihten sonra imparatorluk oldu.";
    const sentences = splitAnswerSentences(text);
    expect(sentences.some((sentence) => sentence === "II.")).toBe(false);
    expect(sentences[0]).toContain("II. Mehmed");
    const errors = validFirstAnswerErrors(text, [
      { wrong: "II. Mehmed İstanbul'u 1453'te fethetti", correct: "II. Mehmed İstanbul'u 1453 yılında aldı" },
    ]);
    expect(errors).toEqual([]);
  });

  it("Zeynep: doğru kurulum ve aritmetik hata %50–%80; çıplak tahmin 7/10 olmaz", () => {
    const model = "Rth = 12 Ω\nVth = 24 V\nPmax = Vth^2 / (4 Rth) = 12 W";
    const worked = adjustScoredAnswer({
      answer: "Rth = 12 Ω ve Vth = 24 V. Pmax = 24^2 / (4*12) = 10 W",
      expected: 12,
      maxPoints: 10,
      modelAnswer: model,
      criteria: ["Thévenin eşdeğerini kurar"],
      earned: 0,
    });
    expect(worked.earned).toBeGreaterThanOrEqual(5);
    expect(worked.earned).toBeLessThanOrEqual(8);
    expect(worked.step).toContain("aritmetik");
    const guess = adjustScoredAnswer({
      answer: "12",
      expected: 12,
      maxPoints: 10,
      modelAnswer: model,
      criteria: ["Thévenin eşdeğerini kurar"],
      earned: 10,
    });
    expect(guess.earned).toBeLessThan(7);
  });

  it("9 konudan 2'si çalışılmışken hazırlık %62 ve üzerine çıkmaz", () => {
    const topics = Array.from({ length: 9 }, (_, index) => ({
      topicKey: `konu-${index}`,
      measured: index < 2,
      level: index < 2 ? ("solid" as const) : ("unmeasured" as const),
      confidence: index < 2 ? 100 : 0,
      evidenceCount: index < 2 ? 5 : 0,
      firstAttemptCorrect: index < 2 ? 5 : 0,
      firstAttemptTotal: index < 2 ? 5 : 0,
      independentCorrect: index < 2 ? 5 : 0,
      independentTotal: index < 2 ? 5 : 0,
      lastPracticedAt: null,
    }));
    const readiness = computeExamReadiness({
      programPct: 100,
      topics,
      plannedTopicKeys: topics.map((topic) => topic.topicKey),
      mockScorePct: 94,
      targetScore: 70,
      openMisconceptions: 0,
      openMisconceptionsKnown: true,
    });
    expect(readiness.pct).toBeLessThan(62);
    expect(readiness.claimFullyReady).toBe(false);
    const view = buildPrepProgressView({
      nodes: [],
      attempts: [
        { nodeId: "a", score: 4, total: 5, createdAt: "2026-10-01T00:00:00.000Z" },
        { nodeId: "a", score: 5, total: 200, createdAt: "2026-10-02T00:00:00.000Z" },
      ],
      topicLabels: ["Tam sayılar", "Oran"],
      gaps: [],
      examDate: null,
      targetScore: 70,
      dailyMinutes: 45,
      measuredReadinessPct: readiness.pct,
      topicMastery: [
        { label: "Tam sayılar", confidence: 40 },
        { label: "Oran", confidence: 0 },
      ],
    });
    expect(view.scorePct).toBe(readiness.pct);
    expect(view.topics.map((topic) => topic.pct)).toEqual([40, 0]);
    expect(view.topics[0]?.solved).toBe(0);
  });

  it("öğrenci metninde iç etiket kalmaz", () => {
    const cleaned = sanitizeStudentCopy(
      "Konu (core) emerging. Kayıtlı sorulardan. Yeni üretim yok. Readiness %94. İpucu: ezberle. Denklem için geçerli ifade hangisidir?",
    );
    expect(cleaned).not.toMatch(/\(core\)|emerging|Kayıtlı sorulardan|Readiness|İpucu:|geçerli ifade hangisidir/);
  });

  it("konu testi yapısal olarak sağlam 5 soruyu silmeden döndürür; deneme vaadi 20/10", async () => {
    expect(DEFAULT_STANDARD.questionCount).toBe(20);
    expect(DEFAULT_SHORT.questionCount).toBe(10);
    const ask = vi.fn(async () => ({
      questions: Array.from({ length: 8 }, (_, index) => question(`Soru ${index}: denklemde x kaçtır?`)),
    }));
    const loop = await teacherQuizLoop(ask, {
      topicLabel: "Denklemler",
      prepTitle: "7. sınıf matematik",
      pages: [{ page: 1, text: "x + 2 = 5" }],
      count: 5,
      scope: "topic_test",
      optionCount: 4,
    });
    expect(loop.questions).toHaveLength(5);
    expect(ask.mock.calls.length).toBeLessThanOrEqual(2);
    expect(loop.questions.map((item) => item.text).join(" ")).not.toContain("yetişmedi");
  });
});
