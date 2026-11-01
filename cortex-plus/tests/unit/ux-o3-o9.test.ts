import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeOfLabel, topicOnlyLabel } from "@/lib/learning/path-labels";

describe("O3 path labels", () => {
  it("drops the grade part from item labels", () => {
    expect(topicOnlyLabel("9. Sınıf · Mantık")).toBe("Mantık");
    expect(topicOnlyLabel("10. SINIF · Kümeler · Alt")).toBe("Kümeler · Alt");
    expect(topicOnlyLabel("9. Sınıf")).toBe("9. Sınıf");
    expect(gradeOfLabel("9. Sınıf · Mantık")).toBe("9. Sınıf");
    expect(gradeOfLabel("Mantık")).toBeNull();
  });
  it("week headers and next-step headings use topic-only labels", () => {
    const src = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(src).toContain("<strong>{topicOnlyLabel(section.title)}</strong>");
    expect(src).toContain("topicOnlyLabel(topic)");
  });
});

describe("O9 plan ready step", () => {
  it("shows a compact summary instead of a second topic editor", () => {
    const src = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
    const plan = src.slice(src.indexOf('step === "plan"'), src.indexOf("<CreditGate"));
    expect(plan).not.toContain("<TopicEditor");
    expect(plan).toContain("plan-summary");
    expect(src.match(/<TopicEditor/g)?.length).toBe(1);
  });
});
