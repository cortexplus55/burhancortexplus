// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

function lessonWith(section: Partial<LessonV2["sections"][number]>): LessonV2 {
  return {
    title: "Mol Kütlesi",
    sections: [
      {
        heading: "Mol Kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
        ...section,
      },
    ],
  };
}

describe("ExamLessonSteps — formula/procedure/table blocks", () => {
  it("renders a formula card separate from the body text", () => {
    const lesson = lessonWith({
      formula: { title: "Mol Sayısı Bağıntısı", expression: "n = m / M", note: "88 g için n = 2 mol." },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText("Mol Sayısı Bağıntısı")).toBeTruthy();
    expect(screen.getByText("n = m / M")).toBeTruthy();
    expect(screen.getByText("88 g için n = 2 mol.")).toBeTruthy();
  });

  it("renders no formula card when the section has none", () => {
    const lesson = lessonWith({});
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.queryByText("n = m / M")).toBeNull();
  });

  it("renders a numbered procedure with label and detail per step", () => {
    const lesson = lessonWith({
      procedure: {
        title: "Mol sayısı hesaplama",
        steps: [
          { label: "Kütleyi belirle", detail: "88 g karbondioksit tartılır." },
          { label: "Mol kütlesine böl", detail: "88 / 44 = 2 mol bulunur." },
        ],
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText("Kütleyi belirle")).toBeTruthy();
    expect(screen.getByText("88 g karbondioksit tartılır.")).toBeTruthy();
    expect(screen.getByText("Mol kütlesine böl")).toBeTruthy();
  });

  it("renders a reference table with a header row and each data row", () => {
    const lesson = lessonWith({
      table: {
        caption: "Kütle-mol karşılıkları",
        columns: ["Kütle (g)", "Mol"],
        rows: [
          ["44", "1"],
          ["88", "2"],
        ],
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText("Kütle-mol karşılıkları")).toBeTruthy();
    expect(screen.getByText("Kütle (g)")).toBeTruthy();
    expect(screen.getByText("44")).toBeTruthy();
    expect(screen.getByText("88")).toBeTruthy();
  });

  it("still renders the section body and question when all three blocks are present together", () => {
    const lesson = lessonWith({
      formula: { title: "Bağıntı", expression: "n = m / M" },
      procedure: { steps: [{ label: "Adım 1", detail: "..." }, { label: "Adım 2", detail: "..." }] },
      table: { columns: ["A", "B"], rows: [["1", "2"]] },
      check: {
        type: "trueFalse",
        prompt: "Mol kütlesi her zaman aynıdır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Madde değişince mol kütlesi de değişir.",
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText(/Mol kütlesi, bir mol maddenin/)).toBeTruthy();
    expect(screen.getByText("Mol kütlesi her zaman aynıdır.")).toBeTruthy();
  });
});
