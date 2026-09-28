/**
 * Belge işleme oturumu.
 *
 * Uzun bir PDF tek istekte sunucu zaman aşımına düşüyordu (504). İş,
 * metin çıkarma ve konu haritası olarak ayrı turlar halinde ilerler;
 * geçici 5xx / ağ hataları üstel geri çekilme ile yeniden denenir.
 */

import { processProgressFingerprint } from "@/lib/documents/process-progress-label";
import { MAP_LEASE_MS } from "@/lib/documents/pdf-learning-v2-lease";

export const PROCESS_STEP_BUDGET_MS = 45_000;

/** İlerleme yoksa bu süreden sonra istemci pes eder (~6 dk). */
export const PROCESS_STALL_MS = 6 * 60 * 1000;

/** leaseBusy responses keep the stall timer alive for lease + buffer. */
export const LEASE_BUSY_ALIVE_MS = MAP_LEASE_MS + 30_000;

/** Same nextPage + retryable 503 this many times → terminal for the client. */
export const MAX_IDENTICAL_RETRYABLE_FAILURES = 3;

export type ProcessPhase = "extract" | "map" | "done";

/** Exam/subject label sent with processing — free text, never a reason to 400. */
export const EXAM_LABEL_MAX_CHARS = 40;

export function clampExamLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().slice(0, EXAM_LABEL_MAX_CHARS).trim();
  return text.length >= 2 ? text : undefined;
}

export function shouldYieldProcessing(
  startedAt: number,
  now = Date.now(),
  budgetMs = PROCESS_STEP_BUDGET_MS,
): boolean {
  return now - startedAt >= budgetMs;
}

export function pickProcessPhase(input: {
  status: string | null;
  chunkCount: number;
  topicMapStatus: string | null;
  learningV2: boolean;
}): ProcessPhase {
  if (input.status === "failed") {
    if (input.chunkCount <= 0) return "extract";
    if (input.learningV2) {
      const mapReady =
        input.topicMapStatus === "ready" || input.topicMapStatus === "reviewed";
      if (!mapReady) return "map";
    }
    return "extract";
  }
  if (input.chunkCount <= 0) return "extract";
  const mapReady =
    input.topicMapStatus === "ready" || input.topicMapStatus === "reviewed";
  if (input.status === "completed" && (!input.learningV2 || mapReady)) return "done";
  if (!input.learningV2 || mapReady) return "done";
  return "map";
}

export function isTransientProcessStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status === 503 || status >= 500;
}

export function transientBackoffMs(
  attempt: number,
  retryAfterMs?: number | null,
): number {
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    // Honour server hint but still grow with attempt so fixed 2s never sticks.
    const hinted = Math.min(retryAfterMs, 120_000);
    const grown = Math.min(30_000, hinted * 2 ** Math.min(attempt, 4));
    return grown + Math.floor(Math.random() * 400);
  }
  const base = Math.min(30_000, 800 * 2 ** Math.min(attempt, 6));
  return base + Math.floor(Math.random() * 400);
}

export function readRetryAfterMs(body: Record<string, unknown>): number | null {
  const fromBody = Number(body.retryAfterMs ?? body.retry_after_ms);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  return null;
}

/**
 * Cursor fingerprint for identical-503 detection. Retryable 503 bodies often
 * carry `nextPage: null`; fall back to the last-known page from a prior 202
 * so three unrelated 503s at different cursors are not collapsed together.
 */
export function stallCursorKey(
  body: Record<string, unknown>,
  lastKnownNextPage?: unknown,
): string {
  const next =
    body.nextPage ??
    body.pagesDone ??
    body.windowsDone ??
    lastKnownNextPage ??
    "";
  const phase = body.phase ?? "";
  return `${phase}:${String(next)}`;
}

/**
 * Shown only after automatic retries are exhausted (OpenAI fully down, etc.).
 * Mid-flight silent retries must not surface this to the student.
 */
export const PROCESS_RETRY_MESSAGE =
  "İşlem tamamlanamadı. İlerlemen duruyor — 'Devam et' ile kaldığın yerden sürdür.";

/** @deprecated Use PROCESS_RETRY_MESSAGE only on exhaustion; silent mid-flight. */
export const PROCESS_AUTO_RETRY_NOTICE = PROCESS_RETRY_MESSAGE;

export type ProcessPost = (body: {
  documentId: string;
  examType?: string | null;
  examDate?: string | null;
  /** Extract only; the course outline runs once all files are in. */
  deferMap?: boolean;
  /** One outline over every file of the course (first = documentId). */
  courseDocumentIds?: string[];
  /** Add-source: the prep the file joins. */
  prepId?: string | null;
}) => Promise<{ status: number; body: Record<string, unknown> }>;

export const postDocumentProcess: ProcessPost = async ({
  documentId,
  examType,
  examDate,
  deferMap,
  courseDocumentIds,
  prepId,
}) => {
  const response = await fetch("/api/documents/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId,
      ...(examType ? { examType } : {}),
      ...(examDate ? { examDate } : {}),
      ...(deferMap ? { deferMap: true } : {}),
      ...(courseDocumentIds?.length ? { courseDocumentIds } : {}),
      ...(prepId ? { prepId } : {}),
    }),
  });
  const raw = await response.json().catch(() => ({}));
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    body.retryAfterMs = Math.max(0, retryAfterSec * 1000);
  }
  return { status: response.status, body };
};

export type ProcessClientResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  retried: boolean;
  rounds: number;
};

function noteProgress(
  body: Record<string, unknown>,
  state: { lastProgressAt: number; lastFingerprint: string | null },
): void {
  const fingerprint = processProgressFingerprint(body);
  if (fingerprint && fingerprint !== state.lastFingerprint) {
    state.lastFingerprint = fingerprint;
    state.lastProgressAt = Date.now();
  }
}

/**
 * İş bitene kadar sorar. Duraksama algısı: nextPage / windowsDone ilerlemiyorsa
 * ~6 dk sonra durur. Aynı nextPage'te 3 retryable 503 → istemci terminal sayar.
 */
export async function requestDocumentProcessing(input: {
  documentId: string;
  post: ProcessPost;
  sleep?: (ms: number) => Promise<void>;
  maxRounds?: number;
  onProgress?: (body: Record<string, unknown>) => void;
  stallMs?: number;
  now?: () => number;
}): Promise<ProcessClientResult> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => Date.now());
  const stallMs = input.stallMs ?? PROCESS_STALL_MS;
  const hardCap = input.maxRounds ?? 10_000;

  let retried = false;
  let rounds = 0;
  let transientAttempt = 0;
  let identicalCursor: string | null = null;
  let identicalFailures = 0;
  let lastKnownNextPage: unknown = null;
  let leaseBusyStreak = false;
  const progressState = {
    lastProgressAt: now(),
    lastFingerprint: null as string | null,
  };

  while (rounds < hardCap) {
    // leaseBusy only extends the stall window by LEASE_BUSY_ALIVE_MS — not forever.
    const idleLimit = leaseBusyStreak ? LEASE_BUSY_ALIVE_MS : stallMs;
    if (now() - progressState.lastProgressAt > idleLimit) {
      return {
        ok: false,
        status: 504,
        body: {
          error: "Belge hâlâ işleniyor. Biraz sonra yeniden dene.",
          code: "processing_timeout",
        },
        retried,
        rounds,
      };
    }

    let response: { status: number; body: Record<string, unknown> } | null = null;
    try {
      response = await input.post({ documentId: input.documentId });
    } catch {
      response = { status: 0, body: { error: "Bağlantı hatası." } };
    }

    rounds += 1;

    if (response && isTransientProcessStatus(response.status)) {
      retried = true;
      const cursor = stallCursorKey(response.body, lastKnownNextPage);
      if (response.status === 503 && cursor === identicalCursor) {
        identicalFailures += 1;
      } else {
        identicalCursor = cursor;
        identicalFailures = 1;
      }
      if (
        response.status === 503 &&
        identicalFailures >= MAX_IDENTICAL_RETRYABLE_FAILURES
      ) {
        return {
          ok: false,
          status: 503,
          body: {
            ...response.body,
            retryable: false,
            error:
              typeof response.body.error === "string"
                ? response.body.error
                : "Sunucu şu an yoğun. Belgen kaydedildi; 'Devam et' ile kaldığı yerden sürdür.",
            code: response.body.code ?? "retryable_exhausted",
          },
          retried,
          rounds,
        };
      }
      const delay = transientBackoffMs(transientAttempt, readRetryAfterMs(response.body));
      transientAttempt += 1;
      await sleep(delay);
      continue;
    }

    transientAttempt = 0;
    identicalCursor = null;
    identicalFailures = 0;

    if (!response) {
      return { ok: false, status: 0, body: { error: "Bağlantı hatası." }, retried, rounds };
    }

    if (response.status === 202) {
      const enteringLeaseBusy =
        response.body.leaseBusy === true && !leaseBusyStreak;
      leaseBusyStreak = response.body.leaseBusy === true;
      noteProgress(response.body, progressState);
      // Arm the shorter alive window once when leaseBusy begins; do not refresh forever.
      if (enteringLeaseBusy) {
        progressState.lastProgressAt = now();
      }
      lastKnownNextPage =
        response.body.nextPage ??
        response.body.pagesDone ??
        response.body.windowsDone ??
        lastKnownNextPage;
      input.onProgress?.(response.body);
      await sleep(rounds === 1 ? 800 : 2_000);
      continue;
    }

    const ok = response.status >= 200 && response.status < 300;
    return { ok, status: response.status, body: response.body, retried, rounds };
  }

  return {
    ok: false,
    status: 504,
    body: { error: "Belge hâlâ işleniyor. Biraz sonra yeniden dene.", code: "processing_timeout" },
    retried,
    rounds,
  };
}

export { processProgressFingerprint };
