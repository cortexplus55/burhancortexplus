// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";
import {
  LESSON_OPEN_COPY,
  difficultyFromFamiliarity,
  stepAfterMood,
} from "@/lib/learning/lesson-open";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";

afterEach(cleanup);

function GateHarness() {
  const [step, setStep] = useState<"familiarity" | "mood" | "recommend" | "create">(
    "familiarity",
  );
  return (
    <LessonOpenChrome
      step={step}
      recommendedTitle={PLAN_NODE_META.lesson.setupLabel}
      blurb={PLAN_NODE_META.lesson.blurb}
      topicLabel="Limit"
      onFamiliarity={() => setStep("mood")}
      onMood={() => setStep("recommend")}
      onContinue={() => setStep("create")}
      onCreate={() => setStep("create")}
    />
  );
}

describe("lesson open gate", () => {
  it("maps familiarity onto a starting difficulty", () => {
    expect(difficultyFromFamiliarity("new")).toBe("kolay");
    expect(difficultyFromFamiliarity("heard")).toBe("kolay");
    expect(difficultyFromFamiliarity("basics")).toBe("orta");
    expect(difficultyFromFamiliarity("good")).toBe("orta");
    expect(difficultyFromFamiliarity("confident")).toBe("ileri");
  });

  it("sends only the intro lesson through the recommendation card", () => {
    expect(stepAfterMood("lesson")).toBe("recommend");
    expect(stepAfterMood("quiz")).toBe("setup");
    expect(stepAfterMood("qa")).toBe("setup");
  });

  it("walks familiarity, mood, the recommended lesson, then create", () => {
    render(<GateHarness />);

    expect(screen.getByRole("heading", { name: LESSON_OPEN_COPY.familiarityTitle })).toBeTruthy();
    expect(screen.getByText(LESSON_OPEN_COPY.familiarityLead)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Bu benim için yeni/ }));

    expect(screen.getByRole("heading", { name: LESSON_OPEN_COPY.moodTitle })).toBeTruthy();
    expect(screen.getByText(LESSON_OPEN_COPY.moodLead)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hazırım" }));

    expect(screen.getByText(LESSON_OPEN_COPY.recommendedKicker)).toBeTruthy();
    expect(screen.getByRole("heading", { name: PLAN_NODE_META.lesson.setupLabel })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: LESSON_OPEN_COPY.recommendedContinue }));

    expect(screen.getByRole("heading", { name: LESSON_OPEN_COPY.exploreTitle })).toBeTruthy();
    expect(screen.getByText(LESSON_OPEN_COPY.exploreLead)).toBeTruthy();
    expect(screen.getByText("Limit")).toBeTruthy();
    expect(screen.getByRole("button", { name: LESSON_OPEN_COPY.create })).toBeTruthy();
  });

  it("keeps the topic reader off the suspense boundary", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/calis/page.tsx", "utf8");
    const session = readFileSync("src/components/parity/exam-prep-study-session.tsx", "utf8");
    const node = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toContain("<Suspense");
    expect(page).not.toMatch(/useSearchParams\(/);
    expect(session).not.toMatch(/useSearchParams\(/);
    expect(session).not.toContain("Bu konuyu anlat");
    expect(session).toContain("LessonOpenChrome");
    expect(session).toContain("familiarity");
    expect(node).toContain('stepAfterMood(kind)');
    expect(node).toContain('step="recommend"');
    expect(node).toContain('step="create"');
  });
});
