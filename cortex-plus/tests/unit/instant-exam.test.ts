import { describe, expect, it } from "vitest";
import { clearInstantExam, peekInstantExam, primeInstantExam } from "@/lib/learning/mock-exam/instant-exam";

const q = [{ id: "q1", text: "Soru", options: ["A", "B"], question_type: "mcq", points: 4 }];

describe("instant exam cache", () => {
  it("returns primed questions only for the same prep and exam, within 2 min", () => {
    clearInstantExam();
    expect(primeInstantExam({ examId: "e1", prepId: "p1", title: "T", questions: q }, 1000)).toBe(true);
    expect(peekInstantExam("p1", "e1", 2000)?.questions).toEqual(q);
    expect(peekInstantExam("p1", "e2", 2000)).toBeNull();
    expect(peekInstantExam("p2", "e1", 2000)).toBeNull();
    expect(peekInstantExam("p1", "e1", 1000 + 120_001)).toBeNull();
  });
  it("ignores missing or malformed questions", () => {
    clearInstantExam();
    expect(primeInstantExam({ examId: "e1", prepId: "p1", title: "T", questions: undefined })).toBe(false);
    expect(primeInstantExam({ examId: "e1", prepId: "p1", title: "T", questions: [{ id: 1 }] })).toBe(false);
    expect(peekInstantExam("p1", "e1")).toBeNull();
  });
});
