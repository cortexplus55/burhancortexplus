// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/parity/review-tools", () => ({ ReviewTools: () => null }));
vi.mock("@/components/learning/question-report-button", () => ({ QuestionReportButton: () => null }));

import { ExamQuestionReviewClient } from "@/components/parity/exam-question-review-client";

afterEach(cleanup);

/*
  İnceleme ekranı (5 Kasım 2026): "Senin cevabın" kutusunun altında çözümün satırları numaralı, her satır ✓ / ✗ / · ;
  ilk hatalı satır vurgulu ve altında tek cümle. Eski kayıtta (steps yok) liste çizilmez, puan notu eskisi gibi.
*/
const questions = [
  { id: "q1", question_text: "Denklemi çöz.", options: [], correct_answer: null },
  { id: "q2", question_text: "Kısaca açıkla.", options: [], correct_answer: null },
];
const sentence = "1. satıra kadar kurulumun doğru; 2. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.";
const reviews = [
  {
    id: "r1",
    question_id: "q1",
    user_answer: "3x + 5 = 20\n3x = 20 + 5\nx = 25/3",
    is_correct: false,
    explanation: "x = 5.",
    liked: false,
    verdict: "kismen",
    points_earned: 5,
    points_max: 10,
    feedback: {
      met: ["Denklemi kurar"],
      missed: ["Sonucu bulur"],
      note: sentence,
      steps: [
        { n: 1, text: "3x + 5 = 20", status: "ok" as const },
        { n: 2, text: "3x = 20 + 5", status: "error" as const, kind: "isaret" as const, note: "terim karşıya geçerken işareti değişmemiş" },
        { n: 3, text: "x = 25/3", status: "unknown" as const },
      ],
      firstError: { line: 2, kind: "isaret" as const, note: "terim karşıya geçerken işareti değişmemiş" },
    },
  },
  {
    id: "r2",
    question_id: "q2",
    user_answer: "Kısa cevap.",
    is_correct: true,
    explanation: null,
    liked: false,
    verdict: "dogru",
    points_earned: 10,
    points_max: 10,
    feedback: { met: ["Ana nokta"], missed: [], note: "Sonuç ve bağıntı doğru; çözümün kısa olması puan düşürmez." },
  },
];

describe("inceleme ekranında satır satır çözüm", () => {
  it("satırlar numaralı ve işaretli; ilk hatalı satır vurgulu, cümle bir kez; eski kayıtta liste yok", () => {
    render(<ExamQuestionReviewClient prepId="p1" examId="e1" examTitle="Deneme" score={55} questions={questions} reviews={reviews} />);
    const list = screen.getByRole("list", { name: "Çözümünün satırları" });
    const rows = list.querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("1.");
    expect(rows[0]?.textContent).toContain("✓");
    expect(rows[1]?.textContent).toContain("✗");
    expect(rows[2]?.textContent).toContain("·");
    expect(rows[1]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.getAttribute("aria-current")).toBeNull();
    expect(rows[1]?.textContent).toContain("3x = 20 + 5");
    // Cümle yalnız hatalı satırın altında: aynı metin ikinci kez (alt not olarak) yazılmaz.
    expect(screen.getAllByText(sentence)).toHaveLength(1);
    expect(rows[1]?.textContent).toContain(sentence);
    // Eski biçim: adım yok, puan notu altta.
    expect(screen.getAllByRole("list", { name: "Çözümünün satırları" })).toHaveLength(1);
    expect(screen.getByText("Sonuç ve bağıntı doğru; çözümün kısa olması puan düşürmez.")).toBeTruthy();
  });

  it("satır metni taşmaz (kırılır) ve sayfa adımları kayıttan okur", () => {
    const client = readFileSync("src/components/parity/exam-question-review-client.tsx", "utf8");
    expect(client).toContain("whitespace-pre-wrap break-words");
    expect(client).toContain("min-w-0 flex-wrap");
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx", "utf8");
    expect(page).toContain("parseStoredSteps(row.steps)");
    expect(page).toContain("parseStoredFirstError(row.firstError, steps)");
    expect(page).toContain("row.step");
  });
});
