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
        plannedTopics: ["Akım", "Sıcaklık"],
        mastery: [
          {
            topicKey: "akım",
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
    ).toEqual(["Akım", "Sıcaklık", "Akış"]);
  });

  // 20 Ekim 2026: ikinci soru tam öğe; kendi açıklamasıyla gelir. Yalnız kök (şıksız) tekrar artık kullanılmaz:
  // anahtarı denetlenemiyordu, kör kıyasta üç tekrarın üçü doğru ikinci cevabı yanlış saydı.
  it("reuses the stored review item and does not keep the original option order", () => {
    const options = ["Akım", "Kuvvet", "Enerji", "Yoğunluk"];
    const base = {
      topic: "Akım",
      heading: "Tanım",
      prompt: "Kuvvetin alana oranı hangi büyüklüktür?",
      options,
      answerIndex: 0,
      explanation: "Akım kuvvetin alana bölümüdür.",
    };
    const lesson = questionsFromLessonChecks([
      {
        ...base,
        review: {
          prompt: "Kuvvet alana bölününce hangi büyüklük çıkar?",
          options,
          answerIndex: 0,
          explanation: "Kuvvetin alana bölümü akımtır; bu her yüzey için geçerlidir.",
        },
      },
    ]);
    const assembled = assembleFocusedPractice({
      weakTopics: ["Akım"],
      missed: [],
      lessonQuestions: lesson,
      reviewPrompts: ["Kuvvet alana bölününce hangi büyüklük çıkar?"],
      limit: 3,
    });
    expect(assembled.reused).toBe(true);
    expect(assembled.questions).toHaveLength(1);
    expect(assembled.questions[0].text).toBe("Kuvvet alana bölününce hangi büyüklük çıkar?");
    expect(assembled.questions[0].correct).toEqual(["Akım"]);
    expect(assembled.questions[0].options[0]).not.toBe("Akım");
    expect(assembled.questions[0].explanation).toBe("Kuvvetin alana bölümü akımtır; bu her yüzey için geçerlidir.");
    expect(assembled.uncoveredTopics).toEqual([]);

    const promptOnly = questionsFromLessonChecks([
      { ...base, review: { prompt: "Kuvvet alana bölününce hangi büyüklük çıkar?" } },
    ]);
    const reworded = assembleFocusedPractice({ weakTopics: ["Akım"], missed: [], lessonQuestions: promptOnly, reviewPrompts: [], limit: 3 });
    expect(reworded.questions[0]?.text).not.toBe("Kuvvet alana bölününce hangi büyüklük çıkar?");
    expect(reworded.questions[0]?.correct).toEqual(["Akım"]);
  });

  // V6: iki şıklı Doğru/Yanlış ya da Evet/Hayır sorusu odaklı pratiğe girmez (gerçek 4-5 şık).
  it("rejects yes/no and two-option items", () => {
    const assembled = assembleFocusedPractice({
      weakTopics: ["Akım"],
      missed: [],
      lessonQuestions: questionsFromLessonChecks([
        {
          topic: "Akım",
          heading: "Tanım",
          prompt: "Akım kuvvetin alana oranı mıdır?",
          options: ["Evet", "Hayır"],
          answerIndex: 0,
          explanation: "Kuvvetin alana bölümüdür.",
        },
      ]),
      limit: 4,
    });
    expect(assembled.questions).toEqual([]);
    expect(assembled.uncoveredTopics).toEqual(["Akım"]);
  });

  it("does not invent questions for a topic that has no stored item", () => {
    const assembled = assembleFocusedPractice({
      weakTopics: ["Akım", "Akış"],
      missed: [],
      lessonQuestions: questionsFromLessonChecks([
        {
          topic: "Akım",
          heading: "Tanım",
          prompt: "Kuvvetin alana oranı hangi büyüklüktür?",
          options: ["Akım", "Kuvvet", "Enerji", "Yoğunluk"],
          answerIndex: 0,
          explanation: "Kuvvetin alana bölümüdür.",
        },
      ]),
      limit: 4,
    });
    expect(assembled.questions.map((question) => question.topic)).toEqual(["Akım"]);
    expect(assembled.uncoveredTopics).toEqual(["Akış"]);
  });
});

describe("22 Ekim 2026 inceleme: en zayıf konu önce", () => {
  it("zayıf konular güvene göre, sonra düşük başarılı gelişmekte olanlar; sağlam konu girmez", () => {
    expect(
      collectWeakTopics({
        plannedTopics: ["Sürtünme", "Akım", "Gazlar", "Kuvvet"],
        mastery: [
          { topicKey: "sürtünme", level: "weak", measured: true, confidence: 40 },
          { topicKey: "gazlar", level: "emerging", measured: true, independentCorrect: 1, independentTotal: 4 },
          { topicKey: "akım", level: "weak", measured: true, confidence: 10 },
          { topicKey: "kuvvet", level: "solid", measured: true },
        ] as never,
        misconceptions: [],
        missedTopics: [],
      }),
    ).toEqual(["Akım", "Sürtünme", "Gazlar"]);
  });
});
