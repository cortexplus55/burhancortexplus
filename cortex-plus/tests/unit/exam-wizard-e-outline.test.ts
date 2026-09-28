import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
const panel = readFileSync("src/components/parity/wizard-processing-panel.tsx", "utf8");
const hub = readFileSync("src/lib/learning/learning-hub.ts", "utf8");
const draft = readFileSync("src/lib/learning/exam-wizard-draft.ts", "utf8");

describe("E: wizard draft + B6 + focus prep wiring", () => {
  it("persists and restores a wizard draft with resume banner", () => {
    expect(draft).toContain("cortex:exam-wizard-draft:v1");
    expect(wizard).toContain("readExamWizardDraft");
    expect(wizard).toContain("writeExamWizardDraft");
    expect(wizard).toContain("clearExamWizardDraft");
    expect(wizard).toContain("Kaldığın yerden devam ediyorsun.");
    expect(wizard).toContain("Baştan başla");
    expect(wizard).toContain("WizardProcessingPanel");
  });

  it("keeps pending process on timeout and shows panel above steps", () => {
    expect(wizard).toContain("processing_timeout");
    expect(wizard).toContain("retryable_exhausted");
    expect(panel).toContain("Devam et");
    expect(panel).toContain("Tekrar dene");
    expect(panel).toContain("Kaldır");
  });

  it("handles intake 409/422/network without silent empty topics", () => {
    expect(wizard).toContain("status === 409");
    expect(wizard).toContain("status === 422");
    expect(wizard).toContain("Konular alınamadı. Tekrar dene.");
    expect(wizard).toContain("intakeAlert");
    expect(wizard).toContain("setStep(\"material\")");
  });

  it("TopicEditor has unit headers and no Kaynak/source meta (B6)", () => {
    expect(wizard).toContain("topicUnits");
    expect(wizard).toContain("apw-topic-unit");
    expect(wizard).not.toContain("Kaynak:");
    expect(wizard).not.toContain("sourceCountLabel");
    expect(wizard).not.toMatch(/Kaynak: s\./);
  });

  it("sets focus cookie after plan create and hub uses selectFocusPrep", () => {
    expect(wizard).toContain("setFocusPrepCookieClient");
    expect(hub).toContain("selectFocusPrep");
    expect(hub).toContain("focusPrepId");
    expect(hub).toContain("urgentChip");
    expect(hub).toContain("switchPreps");
  });
});
