// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";

afterEach(cleanup);

const questions = [
  {
    text: "Basınç nedir?",
    options: ["Kuvvetin alana oranı", "Yalnızca kuvvet"],
    multi: false,
    correct: ["Kuvvetin alana oranı"],
    explanation: "Basınç kuvvetin alana bölümüdür.",
  },
];

describe("written exam quiz play", () => {
  it("does not reveal the explanation while the attempt is open", () => {
    const onContinue = vi.fn();
    function Harness() {
      const [value, setValue] = useState<string | string[]>("");
      return (
        <ExamQuizPlay
          questions={questions}
          index={0}
          value={value}
          onChange={setValue}
          onContinue={onContinue}
          continueLabel="Sınavı bitir"
          examMode
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Kuvvetin alana oranı/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sınavı bitir" }));
    expect(screen.queryByText("Basınç kuvvetin alana bölümüdür.")).toBeNull();
    expect(screen.queryByText("Harika! Doğru yanıt.")).toBeNull();
    expect(screen.queryByText("Yanıtı Kontrol Et")).toBeNull();
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
