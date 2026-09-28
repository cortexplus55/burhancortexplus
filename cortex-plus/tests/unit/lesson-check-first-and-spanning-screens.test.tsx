// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("ExamLessonSteps — checkFirst (retrieval-practice ordering)", () => {
  it("shows the question before the section body when checkFirst is true", () => {
    const lesson = lessonWith({
      checkFirst: true,
      check: {
        type: "trueFalse",
        prompt: "Mol kütlesi her zaman aynıdır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Madde değişince mol kütlesi de değişir.",
      },
    });
    const { container } = render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    const promptIndex = container.innerHTML.indexOf("Mol kütlesi her zaman aynıdır.");
    const bodyIndex = container.innerHTML.indexOf("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(promptIndex).toBeGreaterThan(-1);
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeLessThan(bodyIndex);
  });

  it("shows the section body before the question by default (checkFirst absent)", () => {
    const lesson = lessonWith({
      check: {
        type: "trueFalse",
        prompt: "Mol kütlesi her zaman aynıdır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Madde değişince mol kütlesi de değişir.",
      },
    });
    const { container } = render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    const promptIndex = container.innerHTML.indexOf("Mol kütlesi her zaman aynıdır.");
    const bodyIndex = container.innerHTML.indexOf("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeGreaterThan(-1);
    expect(bodyIndex).toBeLessThan(promptIndex);
  });

  it("still grades correctly when checkFirst is true", () => {
    const lesson = lessonWith({
      checkFirst: true,
      check: {
        type: "trueFalse",
        prompt: "Mol kütlesi her zaman aynıdır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Madde değişince mol kütlesi de değişir.",
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    fireEvent.click(screen.getByRole("button", { name: /Yanlış/ }));
    expect(screen.getByText("🎉 Doğru")).toBeTruthy();
  });
});

describe("ExamLessonSteps — a concept spanning consecutive screens", () => {
  it("renders two consecutive sections that share the same heading as two distinct steps", () => {
    const lesson: LessonV2 = {
      title: "Mol Kütlesi",
      sections: [
        {
          heading: "Mol Kütlesi",
          body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
        },
        {
          heading: "Mol Kütlesi",
          body: "Mol kütlesi hesaplanırken atom kütleleri toplanır.",
        },
      ],
    };
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(screen.getByText("Mol kütlesi hesaplanırken atom kütleleri toplanır.")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });
});
