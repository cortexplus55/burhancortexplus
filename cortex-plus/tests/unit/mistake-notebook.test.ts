import { describe, expect, it } from "vitest";
import {
  MASTERY_STREAK,
  nextReviewState,
  toClientGroups,
  type MistakeEntry,
  type MistakeTopicGroup,
} from "@/lib/learning/mistake-notebook";

const NOW = "2026-09-05T12:00:00.000Z";

function state(correctStreak: number, reviewCount = 0, wrongCount = 1) {
  return { correctStreak, reviewCount, wrongCount };
}

describe("yanlış defteri — tekrar kuralı", () => {
  it("tek doğru soruyu defterden çıkarmaz", () => {
    // Dört şıkta bir isabet dörtte bir; tek doğru bilgi kanıtı değil.
    const next = nextReviewState(state(0), true, NOW);
    expect(next.correctStreak).toBe(1);
    expect(next.masteredAt).toBeNull();
  });

  it("üst üste iki doğru soruyu defterden çıkarır", () => {
    const first = nextReviewState(state(0), true, NOW);
    const second = nextReviewState(
      state(first.correctStreak, first.reviewCount, first.wrongCount),
      true,
      NOW,
    );
    expect(second.correctStreak).toBe(MASTERY_STREAK);
    expect(second.masteredAt).toBe(NOW);
  });

  it("araya giren yanlış seriyi sıfırlar", () => {
    const afterOneCorrect = nextReviewState(state(1), false, NOW);
    expect(afterOneCorrect.correctStreak).toBe(0);
    expect(afterOneCorrect.masteredAt).toBeNull();
  });

  it("yanlış yanıt yanlış sayacını artırır, doğru yanıt artırmaz", () => {
    expect(nextReviewState(state(0, 0, 3), false, NOW).wrongCount).toBe(4);
    expect(nextReviewState(state(0, 0, 3), true, NOW).wrongCount).toBe(3);
  });

  it("her yanıt tekrar sayacını artırır", () => {
    expect(nextReviewState(state(0, 7), true, NOW).reviewCount).toBe(8);
    expect(nextReviewState(state(0, 7), false, NOW).reviewCount).toBe(8);
  });

  it("aşılmış soru yeniden yanlış yapılırsa deftere geri döner", () => {
    // mastered_at dolu bir satırda yanlış yanıt → seri sıfır, mastered null.
    const next = nextReviewState(state(MASTERY_STREAK), false, NOW);
    expect(next.masteredAt).toBeNull();
  });
});

describe("yanlış defteri — istemciye giden paket", () => {
  const entry: MistakeEntry = {
    id: "e1",
    source: "deneme",
    topicLabel: "Üslü sayılar",
    questionText: "2^3 kaçtır?",
    options: ["6", "8", "9"],
    correctAnswer: "8",
    firstWrongAnswer: "6",
    explanation: "Doğru yanıt: 8",
    wrongCount: 2,
    reviewCount: 1,
    correctStreak: 0,
    masteredAt: null,
  };

  const groups: MistakeTopicGroup[] = [
    { label: "Üslü sayılar", entries: [entry] },
  ];

  it("doğru yanıtı ve açıklamayı istemciye göndermez", () => {
    // Bu testin tek işi şu: sayfanın kaynağına bakan öğrenci cevabı
    // okuyamasın. Sızarsa defter neyi bilmediğini değil, neyi kopyaladığını
    // ölçmeye başlar.
    const serialised = JSON.stringify(toClientGroups(groups));
    expect(serialised).not.toContain("Doğru yanıt");
    expect(serialised).not.toContain('"correctAnswer"');
    expect(serialised).not.toContain('"explanation"');
  });

  it("soruyu göstermek için gereken alanları taşır", () => {
    const [group] = toClientGroups(groups);
    expect(group.label).toBe("Üslü sayılar");
    expect(group.questions[0]).toMatchObject({
      id: "e1",
      questionText: "2^3 kaçtır?",
      options: ["6", "8", "9"],
      wrongCount: 2,
    });
  });
});
