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

// 17 Ekim 2026: çok cevaplı soru Astra'daki gibi — ipucu kökün altında, kısmi doğru yüzdeyle.
describe("çok cevaplı soru ekranı", () => {
  it("kökün altında ipucu; bir doğruyu seçince 'Kısmen doğru · %50'", () => {
    const multi = [
      {
        text: "Aşağıdakilerden hangileri krup tablosunda beklenir?",
        options: ["Havlar tarzda öksürük", "İnspiratuvar stridor", "Fokal ral", "Ekspiratuvar uzama"],
        multi: true,
        correct: ["Havlar tarzda öksürük", "İnspiratuvar stridor"],
        explanation: "Krup havlar öksürük ve inspiratuvar stridor yapar.",
      },
    ];
    function Harness() {
      const [value, setValue] = useState<string | string[]>([]);
      return (
        <ExamQuizPlay questions={multi} index={0} value={value} onChange={setValue} onContinue={() => {}} continueLabel="Devam et" />
      );
    }
    render(<Harness />);
    expect(screen.getByText("Birden fazla yanıt seçebilirsin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Havlar tarzda öksürük/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kontrol et" }));
    expect(screen.getByText("Kısmen doğru · %50")).toBeTruthy();
  });
});
