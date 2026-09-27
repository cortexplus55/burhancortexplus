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

describe("ExamLessonSteps — source badge", () => {
  it("shows a compact Kaynak button for a section with structured source metadata, not inline text", () => {
    const lesson = lessonWith({ source: { file: "pdf-12-sayfa.pdf", page: 3 } });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);

    // The citation is not part of the readable lesson text.
    expect(screen.queryByText(/Kaynak:\s*pdf-12-sayfa\.pdf/)).toBeNull();
    // A small trigger exists instead, hidden until asked for.
    const trigger = screen.getByRole("button", { name: /Kaynağı göster/i });
    expect(screen.queryByRole("note")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("note").textContent).toBe("pdf-12-sayfa.pdf, s.3");

    fireEvent.click(screen.getByRole("button", { name: /Kaynağı gizle/i }));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("renders no source control at all when the section has no source", () => {
    const lesson = lessonWith({});
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.queryByRole("button", { name: /Kaynağı göster/i })).toBeNull();
  });

  it("falls back to parsing a legacy inline citation baked into the body (pre-fix content)", () => {
    // No `source` field — this is what a lesson persisted before this
    // change looks like: the citation is the last sentence of `body`.
    const lesson = lessonWith({
      body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Kaynak: pdf-12-sayfa.pdf, s.3.",
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);

    expect(screen.queryByText(/Kaynak:\s*pdf-12-sayfa\.pdf/)).toBeNull();
    expect(screen.getByText("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Kaynağı göster/i })).toBeTruthy();
  });
});
