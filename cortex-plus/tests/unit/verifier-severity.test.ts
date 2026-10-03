import { describe, expect, it, vi } from "vitest";
import { recordValidationEvent } from "@/lib/learning/validation-metrics";
import { parseModelJson, normalizeMathNotation } from "@/lib/learning/teaching-standards";
import { runIndependentValidation } from "@/lib/learning/validation-pipeline";

describe("lenient lesson JSON", () => {
  it("parses LaTeX backslashes instead of calling the draft invalid JSON", () => {
    const raw = String.raw`{"overview":"Basınç \( P = \frac{F}{A} \) ile okunur.","sections":[{"heading":"Basınç",}],}`;
    const parsed = parseModelJson(raw) as { overview: string };
    expect(parsed.overview).toContain("frac");
    const gate = runIndependentValidation({ draft: raw, parsed });
    expect(gate.issues.some((issue) => issue.code === "invalid_json")).toBe(false);
    expect(normalizeMathNotation(parsed.overview)).toMatch(/\\\(|\$/);
    expect(normalizeMathNotation(String.raw`Basınç \frac{F}{A} ile`)).not.toMatch(/\\frac/);
    expect(normalizeMathNotation(String.raw`Basınç \frac{F}{A} ile`)).toMatch(/\(F\)\/\(A\)/);
  });

  it("still reports invalid_json when the text is not JSON at all", () => {
    expect(parseModelJson("bu bir ders cümlesi, json değil")).toBeNull();
    const gate = runIndependentValidation({
      draft: "bu bir ders cümlesi, json değil",
      parsed: null,
    });
    expect(gate.failedStage).toBe("structural");
    expect(gate.issues[0]?.code).toBe("invalid_json");
  });
});

describe("validation event severity log", () => {
  it("writes recheck_passed and the severity split without storing the draft", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await recordValidationEvent(null, {
      userId: "student-1",
      actionCode: "STUDY_PLAN_GENERATE",
      activityKind: "lesson",
      issueSeverity: {
        blocking: ["Kaynakta olmayan formül PV = nRT."],
        nonBlocking: ["Semboller LaTeX formatına yanlış çevrildi."],
      },
      metrics: {
        generationMs: 1,
        validationMs: 2,
        stagesMs: { repair: 3, recheck: 4 },
        failedStage: "pedagogy",
        failureCodes: ["rejected"],
        repairAttempted: true,
        recheckPassed: false,
        outcome: "rejected",
      },
    });
    expect(spy).toHaveBeenCalledWith(
      "ai_validation_event",
      expect.objectContaining({
        repair_attempted: true,
        recheck_passed: false,
        issue_severity: {
          blocking: ["Kaynakta olmayan formül PV = nRT."],
          nonBlocking: ["Semboller LaTeX formatına yanlış çevrildi."],
        },
      }),
    );
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/draft|overview|Basınç formülü P/);
    spy.mockRestore();
  });
});
