// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SolutionView } from "@/components/learning/question-solver";
import type { SolveDone } from "@/lib/solve/solve-client";

afterEach(cleanup);

const done: SolveDone = {
  kind: "done",
  solution: {
    readable: true,
    subject: "Matematik",
    question: "2x + 6 = 14 ise x kaçtır?",
    options: [],
    kind: "open",
    intro: "Denklemi sadeleştir.",
    given: ["2x + 6 = 14"],
    asked: "x",
    steps: [
      { math: "2x = 8", say: "6'yı karşıya geçirdik." },
      { math: "x = 4", say: "İki tarafı 2'ye böldük." },
    ],
    answer: { value: "4", text: "x = 4" },
    optionsWhy: [],
    trap: "",
    tip: "",
    check: "",
  },
  status: "checked",
  verifying: false,
  agreed: true,
  ms: 8000,
};

describe("fotoğraftan çözüm Sokratik kalkan", () => {
  it("hints_first ile ipucu açık, cevap ve adımlar kapalı başlar", () => {
    render(<SolutionView phase={done} initialTutorStyle="hints_first" />);
    expect(screen.getByText("1. İpucu / Sorunun kilidi")).toBeTruthy();
    expect(screen.getByText("Denklemi sadeleştir.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "👀 Çözüm Adımlarını Göster" })).toBeTruthy();
    expect(document.querySelector(".cp-solver-answer--locked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "👀 Çözüm Adımlarını Göster" }));
    expect(screen.getByText("Neden bu adımı yaptık?")).toBeTruthy();
    expect(document.querySelector(".cp-solver-answer--locked")).toBeNull();
  });

  it("doğrudan çözümde tam görünüm açılır; tartışma öğretmen sohbetine gider", () => {
    render(<SolutionView phase={done} initialTutorStyle="direct_solve" />);
    expect(screen.queryByRole("button", { name: "👀 Çözüm Adımlarını Göster" })).toBeNull();
    expect(screen.getByText("Doğru cevap")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Öğretmenle Tartış/ }).getAttribute("href")).toBe("/ogretmen");
  });
});
