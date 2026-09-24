import { describe, expect, it } from "vitest";
import { sealedQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import {
  acceptFilledExplanation,
  acceptFilledExplanations,
  buildWrittenExamReview,
  explanationFillAttempted,
  missingExplanationIndexes,
  readStoredReview,
} from "@/lib/learning/written-exam-review";

const question: QuizQuestion = {
  text: "Basınç hangi büyüklüktür?",
  options: ["Kuvvetin alana oranı", "Yalnızca kuvvet", "Yalnızca alan"],
  correct: ["Kuvvetin alana oranı"],
  multi: false,
  explanation: "Basınç, kuvvetin alana bölümüdür.",
  topic: "Uydurma konu",
};

describe("written exam review", () => {
  it("seals the attempt so the client cannot see the key", () => {
    expect(sealedQuizQuestion(question)).toEqual({
      text: question.text,
      options: question.options,
      multi: false,
    });
  });

  it("groups wrong answers by a known topic and keeps the stored explanation", () => {
    const review = buildWrittenExamReview(
      [{ ...question, topic: "Basınç" }, { ...question, text: "İkinci soru", topic: "Olmayan" }],
      { "0": "Yalnızca kuvvet", "1": "Kuvvetin alana oranı" },
      { fallbackTopic: "Akışkanlar", knownTopics: ["Basınç", "Akışkanlar"] },
    );
    expect(review.score).toBe(1);
    expect(review.items[0].explanation).toBe(question.explanation);
    expect(review.items[0].topic).toBe("Basınç");
    expect(review.items[1].topic).toBe("Akışkanlar");
    expect(review.byTopic.map((group) => group.topic)).toEqual(["Basınç"]);
    expect(review.byTopic[0].missedPrompts).toEqual([question.text]);
  });

  it("does not invent an explanation when none is stored", () => {
    const bare = { ...question, explanation: undefined };
    const review = buildWrittenExamReview([bare], { "0": "Yalnızca kuvvet" }, {
      fallbackTopic: "Basınç",
    });
    expect(review.items[0].explanation).toBeNull();
    expect(missingExplanationIndexes([bare])).toEqual([0]);
  });

  it("rejects a filled explanation that adds a number the question does not have", () => {
    const bare = { ...question, explanation: undefined };
    expect(acceptFilledExplanation(bare, "Basınç 400 birimdir ve kuvvetin alana oranıdır.")).toBeNull();
    expect(
      acceptFilledExplanations([bare], {
        explanations: [
          { index: 0, text: "Doğru şık kuvvetin alana oranıdır." },
          { index: 0, text: "Yeni sayı 900." },
        ],
      })["0"],
    ).toBe("Doğru şık kuvvetin alana oranıdır.");
  });

  it("reads a cached review so a later open does not need another fill", () => {
    const review = buildWrittenExamReview([question], { "0": question.correct[0] }, {
      fallbackTopic: "Basınç",
      knownTopics: ["Basınç"],
    });
    expect(readStoredReview({ writtenReview: review, explanationFillAttempted: true })?.score).toBe(1);
    expect(explanationFillAttempted({ explanationFillAttempted: true })).toBe(true);
  });
});
