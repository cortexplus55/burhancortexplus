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

describe("ExamLessonSteps — legacy duplicate takeaway box", () => {
  it("does not render a note box that just repeats a legacy section's body (pre-fix content)", () => {
    // dropDuplicateNotes (lesson-teach.ts) only runs for lessons taught
    // after this fix; a lesson generated before it still has this note
    // persisted as-is. The client applies the same check at render time.
    const lesson = lessonWith({
      body:
        "Büyüme, çocuğun vücut ölçülerindeki niceliksel artışları ifade eder. " +
        "Gelişme ise motor, dil, bilişsel ve sosyal becerilerin olgunlaşmasını anlatır.",
      note: {
        title: "Büyüme ve Gelişme",
        body:
          "Büyüme, çocuğun vücut ölçülerindeki niceliksel artışı; gelişme ise motor, dil, " +
          "bilişsel ve sosyal becerilerin olgunlaşmasını ifade eder.",
        tone: "info",
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.queryByText("Büyüme ve Gelişme")).toBeNull();
  });

  it("still renders a note that is genuinely distinct from its section body", () => {
    const lesson = lessonWith({
      body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
      note: {
        title: "Avogadro sayısı",
        body: "Bir molde 6,02 × 10^23 tanecik bulunur; bu sabite Avogadro sayısı denir.",
        tone: "info",
      },
    });
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByText("Avogadro sayısı")).toBeTruthy();
  });
});
