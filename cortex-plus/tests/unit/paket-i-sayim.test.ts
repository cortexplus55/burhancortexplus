import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreFromItems } from "@/lib/learning/mock-exam/grade";
import { rowVerdict, rowVerdictCounts, verdictCounts } from "@/lib/learning/mock-exam/verdict-counts";
import type { MockGradeItem } from "@/lib/learning/mock-exam/types";

/*
  Paket I #7 (30 Ekim 2026), sayım kısmı. Canlıda aynı denemenin yanlış sayısı sonuçta 13, incelemede 14-15 çıktı:
  notlandırma kısmen doğruyu yanlışa katıyor, inceleme boşu yanlış sayıyordu. Artık üçü de tek işlevi okur.
*/

describe("doğru / kısmen / yanlış / boş tek işlevden", () => {
  it("dört sayının toplamı soru sayısıdır; kısmen ve boş yanlışa girmez", () => {
    const counts = verdictCounts(["dogru", "kismen", "yanlis", "bos", "dogru", "kismen"]);
    expect(counts).toEqual({ total: 6, correct: 2, partial: 2, wrong: 1, blank: 1 });
    expect(counts.correct + counts.partial + counts.wrong + counts.blank).toBe(counts.total);
  });

  it("eski satırda karar yoksa doğruluk ve cevaptan okunur", () => {
    expect(rowVerdict({ is_correct: true })).toBe("dogru");
    expect(rowVerdict({ is_correct: false, user_answer: "B" })).toBe("yanlis");
    expect(rowVerdict({ is_correct: false, user_answer: " " })).toBe("bos");
    expect(rowVerdict({ user_answer: ["A", "C"] })).toBe("yanlis");
    expect(rowVerdict(undefined)).toBe("bos");
    expect(rowVerdictCounts([{ verdict: "kismen" }, { verdict: "dogru" }, null])).toMatchObject({ partial: 1, correct: 1, blank: 1, wrong: 0 });
  });

  it("notlandırma aynı sayımı kullanır", () => {
    const item = (verdict: MockGradeItem["verdict"], earned: number) =>
      ({ questionId: verdict, userAnswer: "x", isCorrect: verdict === "dogru", pointsEarned: earned, pointsMax: 4, verdict }) as MockGradeItem;
    const scored = scoreFromItems([item("dogru", 4), item("kismen", 2), item("yanlis", 0), item("bos", 0)]);
    expect(scored).toMatchObject({ correct: 1, partial: 1, wrong: 1, blank: 1 });
  });

  it("sonuç sayfası, inceleme ekranı ve kayıtlı sonuç aynı işlevi okur", () => {
    const result = readFileSync("src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx", "utf8");
    expect(result).toContain("rowVerdictCounts(reviews ?? [])");
    const review = readFileSync("src/components/parity/exam-question-review-client.tsx", "utf8");
    expect(review).toContain("verdictCounts(questions.map((q) => reviewVerdict(reviewMap.get(q.id))))");
    const grade = readFileSync("src/lib/learning/mock-exam/grade-exam.ts", "utf8");
    expect(grade).toContain("rowVerdictCounts(reviews ?? [])");
    expect(grade).not.toContain("verdicts.length - correct - blank");
  });
});
