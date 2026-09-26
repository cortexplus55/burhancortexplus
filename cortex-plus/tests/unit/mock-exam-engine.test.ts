import { describe, expect, it } from "vitest";
import {
  allocateQuestions,
  buildBlueprint,
  parseExamFormatFromText,
  multiMcqPoints,
  gradeNumericAnswer,
  gradeRubricAnswer,
  normalizeSubmittedAnswer,
  gradeDeterministicItem,
  letterBalanceOk,
  filterOverlappingQuestions,
  deadlinePassed,
  examDeadlineFromDuration,
  remainingExamSeconds,
} from "@/lib/learning/mock-exam";
import { sameOptionSet as quizSame, selectedOptions as quizSelected } from "@/lib/learning/exam-quiz";

describe("blueprint: exam format parse", () => {
  it("parses 20 mcq + 2 open + 90 dk (chemistry syllabus style)", () => {
    const parsed = parseExamFormatFromText(
      "20 çoktan seçmeli (4'er puan) + 2 klasik (10'ar puan), 90 dk",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.durationMinutes).toBe(90);
    expect(parsed!.slots.filter((s) => s.type === "mcq")).toHaveLength(20);
    expect(parsed!.slots.filter((s) => s.type === "open")).toHaveLength(2);
    expect(parsed!.slots.every((s) => (s.type === "mcq" ? s.points === 4 : s.points === 10))).toBe(
      true,
    );
    expect(parsed!.summary).toContain("20 test");
    expect(parsed!.summary).toContain("2 klasik");
  });

  it("rejects invented numbers not present in text (history)", () => {
    const parsed = parseExamFormatFromText("Yazılı sınav 45 dakikadır.");
    expect(parsed).toBeNull();
  });
});

describe("allocate: weights and out-of-scope", () => {
  it("distributes 20 questions by weight with at least 1 each", () => {
    const rows = allocateQuestions(
      [
        { topicId: "a", topicLabel: "Mol", weightPercent: 25, examHeavy: true, outOfScope: false, passageChars: 100 },
        { topicId: "b", topicLabel: "Stokiyometri", weightPercent: 25, examHeavy: true, outOfScope: false, passageChars: 100 },
        { topicId: "c", topicLabel: "Gazlar", weightPercent: 15, examHeavy: false, outOfScope: false, passageChars: 80 },
        { topicId: "d", topicLabel: "Çözelti", weightPercent: 10, examHeavy: false, outOfScope: false, passageChars: 60 },
        { topicId: "e", topicLabel: "Asit", weightPercent: 10, examHeavy: false, outOfScope: false, passageChars: 60 },
        { topicId: "f", topicLabel: "Tepkime", weightPercent: 10, examHeavy: false, outOfScope: false, passageChars: 50 },
        { topicId: "g", topicLabel: "Deney", weightPercent: 5, examHeavy: false, outOfScope: false, passageChars: 40 },
      ],
      20,
    );
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(20);
    expect(rows.every((r) => r.count >= 1)).toBe(true);
    const mol = rows.find((r) => r.topicLabel === "Mol")!.count;
    const stok = rows.find((r) => r.topicLabel === "Stokiyometri")!.count;
    expect(mol).toBeGreaterThanOrEqual(4);
    expect(stok).toBeGreaterThanOrEqual(4);
  });

  it("gives 0 to out-of-scope topics", () => {
    const rows = allocateQuestions(
      [
        { topicId: "1", topicLabel: "Kurtuluş", weightPercent: 60, examHeavy: true, outOfScope: false, passageChars: 200 },
        { topicId: "2", topicLabel: "1. Dünya", weightPercent: 40, examHeavy: false, outOfScope: false, passageChars: 150 },
        { topicId: "3", topicLabel: "Katlı oranlar", weightPercent: 10, examHeavy: false, outOfScope: true, passageChars: 90 },
      ],
      10,
    );
    expect(rows.find((r) => r.topicLabel === "Katlı oranlar")).toBeUndefined();
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(10);
  });

  it("history 40/60 over 10 → 4/6", () => {
    const rows = allocateQuestions(
      [
        { topicId: "w", topicLabel: "1. Dünya Savaşı", weightPercent: 40, examHeavy: false, outOfScope: false, passageChars: 100 },
        { topicId: "k", topicLabel: "Kurtuluş Savaşı", weightPercent: 60, examHeavy: true, outOfScope: false, passageChars: 100 },
      ],
      10,
    );
    expect(rows.find((r) => r.topicLabel === "1. Dünya Savaşı")!.count).toBe(4);
    expect(rows.find((r) => r.topicLabel === "Kurtuluş Savaşı")!.count).toBe(6);
  });
});

describe("multi_mcq grading (no join pipe regression)", () => {
  it("A,C equals C,A full credit", () => {
    const { earned, full } = multiMcqPoints(["A", "C"], ["C", "A"], 4);
    expect(full).toBe(true);
    expect(earned).toBe(4);
  });

  it("partial credit for subset", () => {
    const { earned, full } = multiMcqPoints(["A"], ["A", "C"], 4);
    expect(full).toBe(false);
    expect(earned).toBe(2);
  });

  it("wrong pick reduces score", () => {
    // hit 1 (A), miss 1 (B) → (1-1)/2 = 0
    const { earned } = multiMcqPoints(["A", "B"], ["A", "C"], 4);
    expect(earned).toBe(0);
  });

  it("normalizeSubmittedAnswer never requires join for multi", () => {
    expect(normalizeSubmittedAnswer(["C", "A"], "multi_mcq")).toEqual(["C", "A"]);
    expect(normalizeSubmittedAnswer("A|C", "multi_mcq")).toEqual(["A", "C"]);
    const item = gradeDeterministicItem(
      {
        id: "q1",
        type: "multi_mcq",
        correctAnswers: ["A", "C"],
        points: 4,
        topicLabel: "Tarih",
      },
      ["C", "A"],
    );
    expect(item.verdict).toBe("dogru");
    expect(item.pointsEarned).toBe(4);
  });

  it("legacy pipe equality is not used for scoring", () => {
    // Regression: answers joined with | must not be compared as a single string to one correct
    const selected = quizSelected(["A", "C"]);
    expect(quizSame(selected, ["A", "C"])).toBe(true);
    expect(quizSame(["A|C"], ["A", "C"])).toBe(false);
  });
});

describe("numeric + rubric", () => {
  it("numeric within tolerance full; missing unit half", () => {
    expect(gradeNumericAnswer("2", 2, "mol", 0.01, 5).earned).toBe(2.5);
    expect(gradeNumericAnswer("2 mol", 2, "mol", 0.01, 5).earned).toBe(5);
    expect(gradeNumericAnswer("3", 2, "mol", 0.01, 5).earned).toBe(0);
  });

  it("rubric 2 of 3 with quotes", () => {
    const rubric = [
      { criterion: "Başlangıç yılı", points: 1 },
      { criterion: "Bitiş yılı", points: 1 },
      { criterion: "Süre", points: 1 },
    ];
    const answer = "Kurtuluş 1919'da başladı, 1923'te bitti.";
    const result = gradeRubricAnswer(answer, rubric, [
      { criterion: "Başlangıç yılı", quote: "1919" },
      { criterion: "Bitiş yılı", quote: "1923" },
    ]);
    expect(result.invalid).toBe(false);
    expect(result.earned).toBe(2);
    expect(result.max).toBe(3);
  });

  it("rubric without quote in answer is invalid", () => {
    const result = gradeRubricAnswer("genel bir cevap", [{ criterion: "Yıl", points: 2 }], [
      { criterion: "Yıl", quote: "1923" },
    ]);
    expect(result.invalid).toBe(true);
    expect(result.earned).toBe(0);
  });
});

describe("session + quality helpers", () => {
  it("deadline grace rejects late answers", () => {
    const { deadline_at } = examDeadlineFromDuration(1, new Date("2026-01-01T00:00:00Z"));
    expect(deadlinePassed(deadline_at, Date.parse("2026-01-01T00:00:30Z"), 120)).toBe(false);
    expect(deadlinePassed(deadline_at, Date.parse("2026-01-01T00:04:00Z"), 120)).toBe(true);
    expect(remainingExamSeconds(deadline_at, Date.parse("2026-01-01T00:00:30Z"))).toBe(30);
  });

  it("filters overlapping question stems", () => {
    const kept = filterOverlappingQuestions([
      { text: "Kurtuluş Savaşı hangi yılda başladı?" },
      { text: "Kurtuluş Savaşı hangi yılda başladı ve bitti?" },
      { text: "Mitozda kromozom sayısı nasıl değişir?" },
    ]);
    expect(kept).toHaveLength(2);
  });

  it("letter balance rejects 50% same letter on large set", () => {
    const questions = Array.from({ length: 10 }, (_, i) => ({
      options: ["A", "B", "C", "D"],
      correctAnswers: [i < 5 ? "A" : i < 8 ? "B" : "C"],
    }));
    expect(letterBalanceOk(questions, 0.4)).toBe(false);
  });
});

describe("buildBlueprint real preset", () => {
  it("uses syllabus when preset is real", () => {
    const syllabus = parseExamFormatFromText(
      "20 çoktan seçmeli (4'er puan) + 2 klasik (10'ar puan), 90 dk",
    );
    const bp = buildBlueprint({
      topics: [
        { topicId: "1", topicLabel: "Hücre", weightPercent: 50, examHeavy: true, outOfScope: false, passageChars: 100 },
        { topicId: "2", topicLabel: "Mitoz", weightPercent: 50, examHeavy: false, outOfScope: false, passageChars: 100 },
      ],
      preset: "real",
      syllabus,
      allowNumeric: false,
    });
    expect(bp.fromSyllabus).toBe(true);
    expect(bp.durationMinutes).toBe(90);
    expect(bp.questionCount).toBe(22);
    expect(bp.slots.some((s) => s.type === "open")).toBe(true);
    expect(bp.allowNumeric).toBe(false);
  });
});

describe("credits + sonuc güvenlik", () => {
  it("grade is free; generate includes evaluation", async () => {
    const { CREDIT_PRICE_TABLE } = await import("@/lib/credits/price-table");
    expect(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GRADE.credits).toBe(0);
    expect(CREDIT_PRICE_TABLE.PRACTICE_EXAM_GENERATE.credits).toBe(8);
  });

  it("sonuc page ignores query.score", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx", "utf8");
    expect(src).toMatch(/scoreNum = attempt/);
    expect(src).not.toMatch(/query\.score != null \? parseInt/);
  });
});
