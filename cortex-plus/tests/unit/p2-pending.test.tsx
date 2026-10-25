// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { OralPreflightDialog, OralReviewTimeDialog } from "@/components/parity/oral-exam-flow";

afterEach(cleanup);

const question = {
  text: "Hücre zarının görevi nedir?",
  options: ["Seçici geçirgenlik", "Enerji üretmek"],
  correct: ["Seçici geçirgenlik"],
  multi: false,
  explanation: "Zar seçici geçirgendir.",
};

describe("anında düğme tepkisi ve kapalı perde", () => {
  it("testi bitir tıklanınca kaydediliyor yazar", () => {
    render(
      <ExamQuizPlay
        questions={[question]}
        index={0}
        value="Seçici geçirgenlik"
        onChange={() => {}}
        onContinue={() => {}}
        continueLabel="Testi bitir"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    fireEvent.click(screen.getByRole("button", { name: "Testi bitir" }));
    expect(screen.getByRole("button", { name: "Kaydediliyor…" }).getAttribute("aria-busy")).toBe("true");
  });

  it("kapalı sözlü penceresi perde bırakmaz", () => {
    const { container, rerender } = render(
      <OralPreflightDialog open onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelector(".cp-oral-modal-back")).not.toBeNull();
    rerender(<OralPreflightDialog open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container.querySelector(".cp-oral-modal-back")).toBeNull();
    const review = render(<OralReviewTimeDialog open={false} onSeeResults={() => {}} />);
    expect(review.container.querySelector(".cp-oral-modal-back")).toBeNull();
  });
});
