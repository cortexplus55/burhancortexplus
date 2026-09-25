import { describe, expect, it } from "vitest";
import {
  assembleFocusedPractice,
  collectWeakTopics,
  questionsFromLessonChecks,
} from "@/lib/learning/focused-practice";

describe("focused practice from stored work", () => {
  it("collects weak mastery, mock misses and lesson review rows", () => {
    expect(
      collectWeakTopics({
        plannedTopics: ["Basınç", "Sıcaklık"],
        mastery: [
          {
            topicKey: "basınç",
            level: "weak",
            measured: true,
          },
          {
            topicKey: "sıcaklık",
            level: "solid",
            measured: true,
            independentCorrect: 3,
            independentTotal: 3,
          },
        ],
        misconceptions: [
          {
            topicLabel: "Sıcaklık",
            sourceKind: "lesson_review",
            wrongType: "lesson_check_miss",
            questionPreview: "Sınavda sıcaklık hangi yönde artar?",
          },
        ],
        missedTopics: ["Akış"],
      }),
    ).toEqual(["Basınç", "Sıcaklık", "Akış"]);
  });

  it("reuses the stored review stem and does not keep the original option order", () => {
    const lesson = questionsFromLessonChecks([
      {
        topic: "Basınç",
        heading: "Tanım",
        prompt: "Basınç kuvvetin alana oranı mıdır?",
        options: ["Evet", "Hayır", "Bazen"],
        answerIndex: 0,
        explanation: "Basınç kuvvetin alana bölümüdür.",
        review: { prompt: "Kuvvet alana bölününce çıkan büyüklük basınç mıdır?" },
      },
    ]);
    const assembled = assembleFocusedPractice({
      weakTopics: ["Basınç"],
      missed: [],
      lessonQuestions: lesson,
      reviewPrompts: ["Kuvvet alana bölününce çıkan büyüklük basınç mıdır?"],
      limit: 3,
    });
    expect(assembled.reused).toBe(true);
    expect(assembled.questions).toHaveLength(1);
    expect(assembled.questions[0].text).toBe("Kuvvet alana bölününce çıkan büyüklük basınç mıdır?");
    expect(assembled.questions[0].correct).toEqual(["Evet"]);
    expect(assembled.questions[0].options[0]).not.toBe("Evet");
    expect(assembled.questions[0].explanation).toBe("Basınç kuvvetin alana bölümüdür.");
    expect(assembled.uncoveredTopics).toEqual([]);
  });

  it("does not invent questions for a topic that has no stored item", () => {
    const assembled = assembleFocusedPractice({
      weakTopics: ["Basınç", "Akış"],
      missed: [],
      lessonQuestions: questionsFromLessonChecks([
        {
          topic: "Basınç",
          heading: "Tanım",
          prompt: "Basınç kuvvetin alana oranı mıdır?",
          options: ["Evet", "Hayır"],
          answerIndex: 0,
          explanation: "Kuvvetin alana bölümüdür.",
        },
      ]),
      limit: 4,
    });
    expect(assembled.questions.map((question) => question.topic)).toEqual(["Basınç"]);
    expect(assembled.uncoveredTopics).toEqual(["Akış"]);
  });
});
