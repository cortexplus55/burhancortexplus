import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXAM_WIZARD_DRAFT_KEY,
  clearExamWizardDraft,
  normalizeDraftStep,
  readExamWizardDraft,
  writeExamWizardDraft,
  type ExamWizardDraft,
} from "@/lib/learning/exam-wizard-draft";

function sampleDraft(overrides: Partial<ExamWizardDraft> = {}): ExamWizardDraft {
  return {
    v: 1,
    step: "material",
    subject: "Matematik",
    examDate: "2026-10-26",
    target: 80,
    language: "tr",
    modality: "auto",
    equalFocus: true,
    focusTopics: [],
    materials: [{ id: "doc-1", fileName: "notlar.pdf", sizeBytes: 1000, pageCount: 10 }],
    failedMaterials: [],
    processing: null,
    title: "Matematik sınav hazırlığı",
    orderEdited: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("exam-wizard-draft", () => {
  afterEach(() => {
    clearExamWizardDraft();
    vi.unstubAllGlobals();
  });

  it("maps building/shaping to language", () => {
    expect(normalizeDraftStep("building")).toBe("language");
    expect(normalizeDraftStep("shaping")).toBe("language");
    expect(normalizeDraftStep("topics")).toBe("topics");
  });

  it("round-trips draft through localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    writeExamWizardDraft(sampleDraft({ step: "building", subject: "Fizik" }));
    const raw = store.get(EXAM_WIZARD_DRAFT_KEY);
    expect(raw).toBeTruthy();
    const read = readExamWizardDraft();
    expect(read?.subject).toBe("Fizik");
    expect(read?.step).toBe("language");
    expect(read?.materials[0]?.id).toBe("doc-1");

    clearExamWizardDraft();
    expect(readExamWizardDraft()).toBeNull();
  });

  it("expires after TTL", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    writeExamWizardDraft(
      sampleDraft({
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
    );
    // Force stale updatedAt into storage
    const parsed = JSON.parse(store.get(EXAM_WIZARD_DRAFT_KEY)!);
    parsed.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    store.set(EXAM_WIZARD_DRAFT_KEY, JSON.stringify(parsed));
    expect(readExamWizardDraft()).toBeNull();
  });
});
