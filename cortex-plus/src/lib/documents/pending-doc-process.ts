export const PENDING_DOC_PROCESS_KEY = "cortex:pending-doc-process";

export type PendingDocProcessSurface = "exam-wizard" | "prep-add" | "documents";

export type PendingDocProcess = {
  documentId: string;
  fileName: string;
  sizeBytes: number | null;
  startedAt: string;
  surface: PendingDocProcessSurface;
};

export function readPendingDocProcess(): PendingDocProcess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_DOC_PROCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDocProcess;
    if (!parsed?.documentId || !parsed.fileName || !parsed.surface) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingDocProcess(entry: PendingDocProcess): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_DOC_PROCESS_KEY, JSON.stringify(entry));
  } catch {
    // quota / private mode
  }
}

export function clearPendingDocProcess(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_DOC_PROCESS_KEY);
  } catch {
    // ignore
  }
}
