import { describe, expect, it } from "vitest";
import { countsAsFailure } from "@/lib/content-pool/fill-server";
import { GATE_VERSION } from "@/lib/content-pool/gate";
import { BLUEPRINT_VERSION } from "@/lib/content-pool/blueprint";
import { LESSON_PROMPT_VERSION, lessonPrompt } from "@/lib/content-pool/generate";

const cur = { gate_version: GATE_VERSION, prompt_version: LESSON_PROMPT_VERSION, lesson_review: { blueprint_version: BLUEPRINT_VERSION } };

describe("countsAsFailure", () => {
  it("güncel sürümlü gerçek ret sayılır", () => {
    expect(countsAsFailure({ status: "rejected", qa: { ...cur, reason: "lesson_review" } })).toBe(true);
  });
  it("elle yeniden kuyruğa alma, zaman aşımı, eski iskelet/istem sürümü sayılmaz", () => {
    expect(countsAsFailure({ status: "rejected", qa: { ...cur, reason: "ambiguous_lesson_question_v2", requeued_at: "2026-11-02T19:34:00Z" } })).toBe(false);
    expect(countsAsFailure({ status: "rejected", qa: { ...cur, reason: "draft_timeout" } })).toBe(false);
    expect(countsAsFailure({ status: "rejected", qa: { ...cur, lesson_review: { blueprint_version: BLUEPRINT_VERSION - 1 } } })).toBe(false);
    expect(countsAsFailure({ status: "rejected", qa: { gate_version: GATE_VERSION, lesson_review: { blueprint_version: BLUEPRINT_VERSION } } })).toBe(false);
    expect(countsAsFailure({ status: "verified", qa: cur })).toBe(false);
  });
});

describe("lessonPrompt geri bildirimi", () => {
  it("ret gerekçesi istemde yer alır", () => {
    const unit = { program: { label: "KPSS", badge: "x", kind: "kpss" }, unit: { title: "Mantık" }, outcomes: [{ code: "A", text: "Koşullu önerme", limitations: [] }] } as never;
    const p = lessonPrompt(unit, ["mantık terimi hatası: \"karşıtı\" q ⇒ ¬p olarak yazılmış"]);
    expect(p.user).toContain("ÖNCEKİ TASLAK");
    expect(p.user).toContain("karşıt tersi \\\"Bir şekil dörtgen değilse kare değildir.\\\"".replace(/\\/g, ""));
    expect(lessonPrompt(unit).user).not.toContain("ÖNCEKİ TASLAK");
  });
});
