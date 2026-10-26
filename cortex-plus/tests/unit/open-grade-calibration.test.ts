import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeOpenItem } from "@/lib/learning/mock-exam/grade";
import { acceptRubric, gradeOpenAnswer, isRubricLabel } from "@/lib/learning/open-rubric";

const points = ["ölçü sabit kalır ve tanım budur", "hariç durum üç gün değişmez çünkü koşul ayrıdır"];

describe("açık uçlu rubrik kalibrasyonu", () => {
  const rubric = acceptRubric(points, 10);

  it("çapalar tam > kısmi > yanlış sırasındadır", () => {
    expect(rubric.length).toBeGreaterThanOrEqual(2);
    expect(rubric.length).toBeLessThanOrEqual(4);
    expect(rubric.reduce((sum, row) => sum + row.points, 0)).toBe(10);
    expect(rubric.every((row) => !isRubricLabel(row.criterion))).toBe(true);
    const full = gradeOpenAnswer(rubric.map((row) => row.criterion).join(". "), rubric);
    const partial = gradeOpenAnswer(rubric[0]!.criterion, rubric);
    const wrong = gradeOpenAnswer("yok", rubric);
    expect(full.earned).toBeGreaterThan(partial.earned);
    expect(partial.earned).toBeGreaterThan(wrong.earned);
    expect(partial.missed.length).toBeGreaterThan(0);
    expect(partial.fix).toContain(partial.missed[0]!);
    expect(`${partial.met.join(" ")} ${partial.missed.join(" ")} ${partial.fix}`).not.toMatch(/ana nokta|mekanizma|definition|mechanism/i);
  });

  it("zayıf cevap tam cevaptan düşük puan alır ve aynı cevap aynı notu verir", () => {
    const question = {
      id: "open",
      type: "open" as const,
      correctAnswers: [],
      points: 10,
      rubric: rubric.map(({ criterion, points: weight }) => ({ criterion, points: weight })),
      topicLabel: "Konu",
    };
    const weak = gradeOpenItem(question, rubric[0]!.criterion);
    const full = gradeOpenItem(question, rubric.map((row) => row.criterion).join(". "));
    const repeat = gradeOpenItem(question, rubric[0]!.criterion);
    expect(weak.pointsEarned).toBeGreaterThan(0);
    expect(weak.pointsEarned).toBeLessThan(full.pointsEarned);
    expect(full.pointsEarned).toBe(10);
    expect(repeat.pointsEarned).toBe(weak.pointsEarned);
    expect(repeat.verdict).toBe(weak.verdict);
    const feedback = JSON.stringify(weak.feedback ?? {});
    expect(feedback).not.toMatch(/ana nokta/i);
    expect(feedback).toContain("Eksik kalan noktayı kendi cümlenle ekle");
  });

  it("etiket yedeği kaynakta yok", () => {
    expect(readFileSync("src/lib/learning/mock-exam/create.ts", "utf8")).not.toContain("Ana nokta");
    expect(readFileSync("src/lib/learning/mock-exam/grade-exam.ts", "utf8")).not.toContain("Ana nokta");
    expect(isRubricLabel("Ana nokta")).toBe(true);
    expect(isRubricLabel("ölçü sabit kalır")).toBe(false);
  });
});
