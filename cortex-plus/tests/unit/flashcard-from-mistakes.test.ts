import { describe, expect, it } from "vitest";
import {
  cardFromMistakeEntry,
  cardsFromMistakeEntries,
  cardFromMisconception,
} from "@/lib/learning/flashcard-from-mistakes";

describe("flashcard from mistakes", () => {
  it("builds a free card from mistake_entries without a model", () => {
    const card = cardFromMistakeEntry({
      id: "abc-1",
      questionText: "Cumhuriyet hangi yılda ilan edildi?",
      correctAnswer: "1923",
      explanation: "Türkiye Cumhuriyeti 29 Ekim 1923'te ilan edildi.",
      topicLabel: "Türkiye tarihi",
    });
    expect(card).not.toBeNull();
    expect(card!.fromMistake).toBe(true);
    expect(card!.cardSource).toBe("mistake");
    expect(card!.front).toContain("Cumhuriyet");
    expect(card!.back).toContain("1923");
    expect(card!.cardKey.startsWith("mistake:")).toBe(true);
  });

  it("skips entries without a correct answer", () => {
    expect(
      cardFromMistakeEntry({
        id: "x",
        questionText: "Soru?",
        correctAnswer: null,
        explanation: null,
      }),
    ).toBeNull();
  });

  it("builds from misconception / oral miss text", () => {
    const card = cardFromMisconception({
      id: "m-9",
      questionPreview: "Mitozda kaç yavru hücre oluşur?",
      corrected: "İki yavru hücre. DNA eşit paylaşılır.",
      claim: null,
      wrongType: "quiz_miss",
      topicLabel: "Hücre bölünmesi",
    });
    expect(card!.fromMistake).toBe(true);
    expect(card!.back).toMatch(/İki/i);
  });

  it("dedupes by card key", () => {
    const cards = cardsFromMistakeEntries([
      {
        id: "1",
        questionText: "Aynı soru",
        correctAnswer: "Cevap",
        explanation: null,
      },
      {
        id: "1",
        questionText: "Aynı soru",
        correctAnswer: "Cevap",
        explanation: null,
      },
    ]);
    expect(cards).toHaveLength(1);
  });
});
