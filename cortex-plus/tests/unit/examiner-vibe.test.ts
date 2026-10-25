import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_EXAMINER_VIBE,
  EXAMINER_VIBE_OPTIONS,
  examinerVibeGradeLine,
  examinerVibeStyleLine,
  parseExaminerVibe,
  vibeGivesHints,
} from "@/lib/learning/examiner-vibe";

const read = (path: string) => readFileSync(path, "utf8");

describe("examiner vibe", () => {
  it("üç karakter; bilinmeyen ve eski hava destekleyiciye düşer", () => {
    expect(EXAMINER_VIBE_OPTIONS.map((item) => item.id)).toEqual([
      "supportive",
      "strict_jury",
      "challenger",
    ]);
    expect(parseExaminerVibe(undefined)).toBe(DEFAULT_EXAMINER_VIBE);
    expect(parseExaminerVibe("helpful")).toBe("supportive");
    expect(parseExaminerVibe("strict")).toBe("strict_jury");
    expect(parseExaminerVibe("harsh")).toBe("challenger");
    expect(vibeGivesHints("supportive")).toBe(true);
    expect(vibeGivesHints("strict_jury")).toBe(false);
  });

  it("soru ve not tonu karaktere göre değişir; hakaret yok", () => {
    expect(examinerVibeStyleLine("supportive")).toMatch(/ipucu/);
    expect(examinerVibeStyleLine("strict_jury")).toMatch(/ipucu verme/);
    expect(examinerVibeStyleLine("challenger")).toMatch(/hakaret etme/);
    expect(examinerVibeGradeLine("supportive")).toMatch(/motive/);
    expect(examinerVibeGradeLine("strict_jury")).toMatch(/resmi/);
    expect(examinerVibeGradeLine("challenger")).toMatch(/Emin misin/);
  });

  it("generate ve grade uçları examinerVibe alır, varsayılan parse edilir", () => {
    expect(read("src/app/api/learning/oral/generate/route.ts")).toContain("examinerVibe");
    expect(read("src/app/api/learning/oral/generate/route.ts")).toContain("parseExaminerVibe");
    expect(read("src/app/api/learning/oral/grade/route.ts")).toContain("examinerVibeGradeLine");
    expect(read("src/app/api/learning/oral/grade/route.ts")).toContain("parseExaminerVibe");
  });
});
