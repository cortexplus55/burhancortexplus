import { describe, expect, it } from "vitest";
import { needsExamIntro } from "@/lib/learning/exam-prep-hrefs";

describe("exam intro gate", () => {
  const fresh = [{ status: "ready" }, { status: "locked" }];

  it("asks for the diagnostic on a fresh prep", () => {
    expect(needsExamIntro(null, fresh)).toBe(true);
  });

  it("stops asking once it is completed", () => {
    expect(needsExamIntro("2026-09-10T10:00:00Z", fresh)).toBe(false);
  });

  it("lets a deferred student into the content", () => {
    // Test tüm içeriği kilitliyordu; erteleyen öğrenci derse girebilmeli.
    expect(needsExamIntro(null, fresh, "2026-09-10T10:00:00Z")).toBe(false);
  });

  it("still skips the gate once any node is done", () => {
    expect(needsExamIntro(null, [{ status: "done" }])).toBe(false);
  });
});
