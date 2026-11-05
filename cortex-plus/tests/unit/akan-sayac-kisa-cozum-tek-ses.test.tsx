// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { adjustScoredAnswer } from "@/lib/learning/mock-exam/grade";
import { visibleSpeakers } from "@/lib/learning/podcast-speakers";

/*
  4 Kasım 2026'da kapanıp birleşmeyen #559'un üç maddesi (5 Kasım 2026'da yeniden uygulandı):
  B8 işlem gösteren kısa cevap tam puan, B9 akan testte sayaç sözü verilen sayıyla, B15 tek sesli özette tek görsel.
*/

describe("klasik puanlama: eşdeğer kesir zinciri (B8)", () => {
  it("sayılar arası işlem gösteren kısa cevap çıplak sonuç sayılmaz, tam puan alır", () => {
    const modelAnswer = "Birinci oran 30 ÷ 3 = 10, ikinci oran 24 ÷ 3 = 8; oranların oranı 10/8 = 1,25.";
    const r = adjustScoredAnswer({ answer: "x/y = 30/24 = 5/4 = 1,25", expected: null, maxPoints: 10, modelAnswer, earned: 6.5 });
    expect(r.earned).toBe(10);
  });
  it("çıplak sonuç yine sınırlı kalır", () => {
    const r = adjustScoredAnswer({ answer: "1,25", expected: 1.25, maxPoints: 10, modelAnswer: "d = 10/8 = 1,25", criteria: ["oran kurulumu"], earned: 10 });
    expect(r.earned).toBeLessThan(10);
  });
});

describe("akan testte sayaç (B9)", () => {
  const questions = [
    { text: "Birinci soru?", options: ["a", "b"], multi: false },
    { text: "İkinci soru?", options: ["a", "b"], multi: false },
  ];
  it("sözü verilen sayı gelen sorudan büyükse payda o sayıdır", () => {
    render(<ExamQuizPlay questions={questions} index={0} value={undefined} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki" plannedTotal={5} />);
    expect(screen.getByText("Soru 1 / 5")).toBeTruthy();
  });
  it("sözü verilen sayı yoksa ya da küçükse gelen soru sayısı yazılır", () => {
    const { unmount } = render(<ExamQuizPlay questions={questions} index={1} value={undefined} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki" />);
    expect(screen.getByText("Soru 2 / 2")).toBeTruthy();
    unmount();
    render(<ExamQuizPlay questions={questions} index={1} value={undefined} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki" plannedTotal={1} />);
    expect(screen.getByText("Soru 2 / 2")).toBeTruthy();
  });
});

describe("tek sesli özette konuşmayan ses çizilmez (B15)", () => {
  it("yalnız konuşan sesler; çizelge boşken ikisi de", () => {
    expect(visibleSpeakers([{ speaker: "ada" }, { speaker: "ada" }])).toEqual(["ada"]);
    expect(visibleSpeakers([{ speaker: "kerem" }])).toEqual(["kerem"]);
    expect(visibleSpeakers([{ speaker: "ada" }, { speaker: "kerem" }])).toEqual(["ada", "kerem"]);
    expect(visibleSpeakers([])).toEqual(["ada", "kerem"]);
  });
});
