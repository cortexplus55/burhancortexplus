// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/parity/review-tools", () => ({ ReviewTools: () => null }));

import { ExamQuestionReviewClient, reviewVerdict } from "@/components/parity/exam-question-review-client";

afterEach(cleanup);

/*
  17 Ekim 2026, canlı: açık uçlu "üfürüm" sorusu yapay zekâdan 7/10 aldı ama inceleme
  sayfası yalnız is_correct okuduğu için "Yanlış / Boş" yazıyordu; öğrenci neyin eksik
  kaldığını ("ikinci kalp sesinin özellikleri") hiç görmüyordu. Astra kısmi doğruyu
  gösteriyor.
*/
const questions = [
  { id: "q1", question_text: "Üfürüm değerlendirilirken neye bakarsın?", options: [], correct_answer: null },
  { id: "q2", question_text: "İki kelimeli cümle hangi yaşta?", options: ["12 ay", "18 ay", "2 yaş", "3 yaş"], correct_answer: "2 yaş" },
  { id: "q3", question_text: "ABCDE yaklaşımını açıkla.", options: [], correct_answer: null },
];
const reviews = [
  {
    id: "r1",
    question_id: "q1",
    user_answer: "Siyanoz ve büyüme geriliği kalp hastalığını düşündürür; zamanlaması incelenir.",
    is_correct: false,
    explanation: "Örnek cevap.",
    liked: false,
    verdict: "kismen",
    points_earned: 7,
    points_max: 10,
    feedback: { met: ["Eşlik eden bulgular", "Zamanlama"], missed: ["İkinci kalp sesinin özellikleri"] },
  },
  // Eski kayıt: karar alanı yok.
  { id: "r2", question_id: "q2", user_answer: "18 ay", is_correct: false, explanation: null, liked: false },
  { id: "r3", question_id: "q3", user_answer: "", is_correct: false, explanation: null, liked: false, verdict: "bos", points_earned: 0, points_max: 10, feedback: null },
];

describe("deneme inceleme: kısmi doğru ve açık uçlu geri bildirim", () => {
  it("karar: kayıtlı verdict önce; eski kayıtta cevaba göre yanlış ya da boş", () => {
    expect(reviewVerdict(reviews[0])).toBe("kismen");
    expect(reviewVerdict(reviews[1])).toBe("yanlis");
    expect(reviewVerdict({ ...reviews[1], user_answer: "" })).toBe("bos");
    expect(reviewVerdict(undefined)).toBe("bos");
  });

  it("7/10 alan açık uçlu cevap 'Kısmen doğru' görünür; cevap, karşılanan ve eksik noktalar listelenir", () => {
    const { container } = render(
      <ExamQuestionReviewClient prepId="p1" examId="e1" examTitle="Pediatri" score={37} questions={questions} reviews={reviews} />,
    );
    expect(screen.getByText("Kısmen doğru · 7/10 puan")).toBeTruthy();
    expect(screen.queryByText("Yanlış / Boş")).toBeNull();
    expect(screen.getByText(reviews[0]!.user_answer)).toBeTruthy();
    expect(screen.getByText("İkinci kalp sesinin özellikleri")).toBeTruthy();
    expect(screen.getByText("Zamanlama")).toBeTruthy();
    expect(screen.getByText("Boş bıraktın.")).toBeTruthy();
    expect(screen.getByText("1 Kısmen")).toBeTruthy();
    // Çoktan seçmelide cevap kutusu yok; şıklar yine işaretli.
    expect(container.querySelectorAll(".cp-review-open")).toHaveLength(2);
    expect(screen.getByText("Yanlış")).toBeTruthy();
  });

  it("sonuç sayfası kısmen alan cevabı yanlış saymaz; inceleme sayfası karar ve puanı okur", () => {
    const result = readFileSync("src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx", "utf8");
    // 30 Ekim 2026 (Paket I #7): sayım tek işlevden; kısmen ayrı sayılır (`paket-i-sayim.test.ts`).
    expect(result).toContain("const { correct, blank, partial, wrong } = rowVerdictCounts(reviews ?? []);");
    expect(result).toContain('["Kısmen", partial]');
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx", "utf8");
    expect(page).toContain("verdict, points_earned, points_max, feedback");
  });
});
