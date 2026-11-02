import { describe, expect, it } from "vitest";
import { previewLabel } from "@/components/parity/exam-prep-reviews";

describe("yanılgı kartı önizleme etiketi", () => {
  it("öğrencinin cevabını tutan kaynaklarda 'Senin cevabın:'", () => {
    for (const k of ["quiz", "focused", "gaps", "chat"]) expect(previewLabel(k)).toBe("Senin cevabın:");
  });
  it("soru metni tutan kaynaklarda 'Soru:'", () => {
    for (const k of ["oral", "lesson_review", "true_false", null, undefined]) expect(previewLabel(k)).toBe("Soru:");
  });
});
