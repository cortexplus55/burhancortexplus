/**
 * Exam-create wizard draft — survives remounts / tab discard.
 * localStorage key cortex:exam-wizard-draft:v1, TTL 24h.
 */

export const EXAM_WIZARD_DRAFT_KEY = "cortex:exam-wizard-draft:v1";
export const EXAM_WIZARD_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type WizardDraftStep =
  | "start"
  | "subject"
  | "date"
  | "target"
  | "material"
  | "language"
  | "building"
  | "shaping"
  | "topics"
  | "modality"
  | "focus"
  | "plan";

export type ExamWizardDraft = {
  v: 1;
  step: WizardDraftStep;
  subject: string;
  examDate: string;
  target: number;
  language: "tr" | "en";
  modality: string;
  equalFocus: boolean;
  focusTopics: string[];
  materials: {
    id: string;
    fileName: string;
    sizeBytes: number | null;
    pageCount: number | null;
  }[];
  failedMaterials: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
    error: string;
  }[];
  processing: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
    startedAt: string;
  } | null;
  topicsDraft?: {
    topics: string[];
    units?: { title: string; topicIndexes: number[] }[];
    topicPages?: number[][];
    topicFiles?: string[][];
    topicWarnings?: string[];
    meta?: {
      sourceCount: number;
      examHeavy: boolean;
      important: boolean;
      sections: string[];
      unitTitle?: string | null;
    }[];
  };
  title: string;
  orderEdited: boolean;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Map ephemeral build steps back to a resumable step. */
export function normalizeDraftStep(step: WizardDraftStep): WizardDraftStep {
  if (step === "building" || step === "shaping") return "language";
  return step;
}

export function readExamWizardDraft(
  now = Date.now(),
): ExamWizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXAM_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1) return null;
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts) || now - ts > EXAM_WIZARD_DRAFT_TTL_MS) {
      clearExamWizardDraft();
      return null;
    }
    const step = normalizeDraftStep(
      (typeof parsed.step === "string" ? parsed.step : "start") as WizardDraftStep,
    );
    return {
      v: 1,
      step,
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      examDate: typeof parsed.examDate === "string" ? parsed.examDate : "",
      target: typeof parsed.target === "number" ? parsed.target : 75,
      language: parsed.language === "en" ? "en" : "tr",
      modality: typeof parsed.modality === "string" ? parsed.modality : "auto",
      equalFocus: parsed.equalFocus !== false,
      focusTopics: Array.isArray(parsed.focusTopics)
        ? parsed.focusTopics.filter((t): t is string => typeof t === "string")
        : [],
      materials: Array.isArray(parsed.materials)
        ? parsed.materials.flatMap((item) => {
            if (!isRecord(item) || typeof item.id !== "string") return [];
            return [
              {
                id: item.id,
                fileName: typeof item.fileName === "string" ? item.fileName : "Belge",
                sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
                pageCount: typeof item.pageCount === "number" ? item.pageCount : null,
              },
            ];
          })
        : [],
      failedMaterials: Array.isArray(parsed.failedMaterials)
        ? parsed.failedMaterials.flatMap((item) => {
            if (!isRecord(item) || typeof item.documentId !== "string") return [];
            return [
              {
                documentId: item.documentId,
                fileName: typeof item.fileName === "string" ? item.fileName : "Belge",
                sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
                error: typeof item.error === "string" ? item.error : "İşlenemedi.",
              },
            ];
          })
        : [],
      processing: isRecord(parsed.processing) && typeof parsed.processing.documentId === "string"
        ? {
            documentId: parsed.processing.documentId,
            fileName:
              typeof parsed.processing.fileName === "string"
                ? parsed.processing.fileName
                : "Belge",
            sizeBytes:
              typeof parsed.processing.sizeBytes === "number"
                ? parsed.processing.sizeBytes
                : null,
            startedAt:
              typeof parsed.processing.startedAt === "string"
                ? parsed.processing.startedAt
                : new Date().toISOString(),
          }
        : null,
      topicsDraft: isRecord(parsed.topicsDraft)
        ? {
            topics: Array.isArray(parsed.topicsDraft.topics)
              ? parsed.topicsDraft.topics.filter((t): t is string => typeof t === "string")
              : [],
            units: Array.isArray(parsed.topicsDraft.units)
              ? (parsed.topicsDraft.units as ExamWizardDraft["topicsDraft"] extends
                  | { units?: infer U }
                  | undefined
                  ? U
                  : never)
              : undefined,
            topicPages: Array.isArray(parsed.topicsDraft.topicPages)
              ? (parsed.topicsDraft.topicPages as number[][])
              : undefined,
            topicFiles: Array.isArray(parsed.topicsDraft.topicFiles)
              ? (parsed.topicsDraft.topicFiles as string[][])
              : undefined,
            topicWarnings: Array.isArray(parsed.topicsDraft.topicWarnings)
              ? (parsed.topicsDraft.topicWarnings as string[])
              : undefined,
            meta: Array.isArray(parsed.topicsDraft.meta)
              ? (parsed.topicsDraft.meta as NonNullable<ExamWizardDraft["topicsDraft"]>["meta"])
              : undefined,
          }
        : undefined,
      title: typeof parsed.title === "string" ? parsed.title : "",
      orderEdited: parsed.orderEdited === true,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeExamWizardDraft(draft: ExamWizardDraft): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ExamWizardDraft = {
      ...draft,
      v: 1,
      step: normalizeDraftStep(draft.step),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(EXAM_WIZARD_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function clearExamWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EXAM_WIZARD_DRAFT_KEY);
  } catch {
    // ignore
  }
}
