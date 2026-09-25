/**
 * Belge işleme oturumu.
 *
 * Uzun bir PDF tek istekte sunucu zaman aşımına düşüyordu (504). İş,
 * metin çıkarma ve konu haritası olarak ayrı turlar halinde ilerler;
 * geçici 5xx bir kez yeniden denenir.
 */

export const PROCESS_STEP_BUDGET_MS = 45_000;

export type ProcessPhase = "extract" | "map" | "done";

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
  const mapReady =
    input.topicMapStatus === "ready" || input.topicMapStatus === "reviewed";
  if (input.status === "completed" && (!input.learningV2 || mapReady)) return "done";
  if (input.chunkCount <= 0) return "extract";
  if (!input.learningV2 || mapReady) return "done";
  return "map";
}

export function isTransientProcessStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export const PROCESS_RETRY_MESSAGE =
  "Dosya işlenirken sunucu yanıt vermedi. Bir kez daha deniyorum.";

export type ProcessPost = (body: {
  documentId: string;
}) => Promise<{ status: number; body: Record<string, unknown> }>;

export const postDocumentProcess: ProcessPost = async ({ documentId }) => {
  const response = await fetch("/api/documents/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  const raw = await response.json().catch(() => ({}));
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return { status: response.status, body };
};

export type ProcessClientResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  retried: boolean;
  rounds: number;
};

/**
 * İş bitene kadar sorar. Her turda geçici 5xx yalnızca bir kez yenilenir.
 * 202, haritanın sıradaki turda süreceği anlamına gelir.
 */
export async function requestDocumentProcessing(input: {
  documentId: string;
  post: ProcessPost;
  sleep?: (ms: number) => Promise<void>;
  maxRounds?: number;
}): Promise<ProcessClientResult> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRounds = input.maxRounds ?? 8;
  let retried = false;

  for (let round = 0; round < maxRounds; round += 1) {
    let response: { status: number; body: Record<string, unknown> } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await input.post({ documentId: input.documentId });
      } catch {
        response = { status: 0, body: { error: "Bağlantı hatası." } };
      }
      if (response && !isTransientProcessStatus(response.status) && response.status !== 0) break;
      if (attempt === 0) {
        retried = true;
        continue;
      }
      break;
    }
    if (!response) {
      return { ok: false, status: 0, body: { error: "Bağlantı hatası." }, retried, rounds: round + 1 };
    }
    if (response.status === 202) {
      await sleep(round === 0 ? 400 : 800);
      continue;
    }
    const ok = response.status >= 200 && response.status < 300;
    return { ok, status: response.status, body: response.body, retried, rounds: round + 1 };
  }

  return {
    ok: false,
    status: 504,
    body: { error: "Belge hâlâ işleniyor. Biraz sonra yeniden dene." },
    retried,
    rounds: maxRounds,
  };
}
