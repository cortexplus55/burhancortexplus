/**
 * TypeSafe Jev HTTP client — official SystemOne shape.
 * Server-only. Never log or return API key material.
 */

import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  resolveJevCredential,
  resolveJevModelName,
  type JevAccessResolved,
  type JevCredential,
} from "@/lib/adaptive/jev/access";
import {
  buildJevState,
  defaultJevQuestions,
  type JevQuestionsMap,
} from "@/lib/adaptive/jev/questions";
import type { JevErrorCode } from "@/lib/adaptive/jev/error-codes";
import type { CompactDecisionState, LearningAction } from "@/lib/adaptive/types";

export type { JevErrorCode };

export type JevCallSuccess = {
  ok: true;
  raw: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  gatewayCostUsd?: number;
  access: JevAccessResolved;
  latencyMs: number;
  attempts: number;
};

export type JevCallFailure = {
  ok: false;
  error: JevErrorCode;
  status?: number;
  message?: string;
  latencyMs: number;
  attempts: number;
  retryable: boolean;
};

export type JevCallResult = JevCallSuccess | JevCallFailure;

/** Re-export for callers that previously imported questions from client. */
export { defaultJevQuestions };

/** Pure — no network. Prefer env override, else access-default. */
export function resolveJevModel(
  access: JevAccessResolved = "typesafe",
): string {
  return resolveJevModelName({
    access,
    configured: env.JEV_MODEL,
  });
}

function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) {
      out = out.split(s).join("[redacted]");
    }
  }
  return out;
}

function clipMessage(raw: unknown, secrets: string[] = []): string | undefined {
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw && typeof raw === "object") {
    const o = raw as { message?: unknown; error?: unknown; error_type?: unknown };
    if (typeof o.message === "string") text = o.message;
    else if (typeof o.error === "string") text = o.error;
    else text = JSON.stringify(raw);
  }
  if (!text) return undefined;
  return redactSecrets(text, secrets).slice(0, 200);
}

/** Upstream gateway payment status (400+2). Never sent as this app's HTTP response. */
const UPSTREAM_PAYMENT_REQUIRED = 400 + 2;

function statusToError(status: number): {
  error: JevErrorCode;
  retryable: boolean;
} {
  if (status === 401) return { error: "unauthorized", retryable: false };
  if (status === UPSTREAM_PAYMENT_REQUIRED) {
    return { error: "payment_required", retryable: false };
  }
  if (status === 403) return { error: "forbidden", retryable: false };
  if (status === 422) return { error: "invalid_request", retryable: false };
  if (status === 429) return { error: "rate_limited", retryable: true };
  if (status === 529) return { error: "overloaded", retryable: true };
  if (status >= 500) return { error: "server_error", retryable: true };
  return { error: "invalid_response", retryable: false };
}

function combineSignals(
  timeoutMs: number,
  external?: AbortSignal,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeout, external]);
  }
  // Fallback: prefer timeout; external abort is best-effort via listener.
  return timeout;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().finite().min(0).max(1),
});

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
});

const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number().finite(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
});

const responseSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      input_tokens: z.number().finite().optional(),
      output_tokens: z.number().finite().optional(),
    })
    .optional(),
  provider_metadata: z
    .object({
      gateway: z
        .object({
          cost: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional(),
});

function validateAnswersAgainstQuestions(
  answers: Record<string, unknown>,
  questions: JevQuestionsMap,
): { ok: true } | { ok: false; detail: string } {
  for (const [key, q] of Object.entries(questions)) {
    const ans = answers[key];
    if (ans === undefined) {
      return { ok: false, detail: `missing_answer:${key}` };
    }
    if (q.type === "noul") {
      const parsed = noulAnswerSchema.safeParse(ans);
      if (!parsed.success) {
        return { ok: false, detail: `bad_noul:${key}` };
      }
    } else if (q.type === "choice") {
      const parsed = choiceAnswerSchema.safeParse(ans);
      if (!parsed.success) {
        return { ok: false, detail: `bad_choice:${key}` };
      }
      if (!(parsed.data.choice in q.criteria)) {
        return { ok: false, detail: `choice_out_of_criteria:${key}` };
      }
    } else {
      const parsed = scoreAnswerSchema.safeParse(ans);
      if (!parsed.success) {
        return { ok: false, detail: `bad_score:${key}` };
      }
      const max = Math.max(0, q.criteria.length - 1);
      if (parsed.data.score < 0 || parsed.data.score > max) {
        return { ok: false, detail: `score_out_of_range:${key}` };
      }
    }
  }
  return { ok: true };
}

async function getCredential(): Promise<JevCredential> {
  return resolveJevCredential({
    mode: env.JEV_ACCESS,
    typesafeKey: env.TYPESAFE_API_KEY,
    gatewayKey: env.AI_GATEWAY_API_KEY,
    baseUrlOverride: env.JEV_BASE_URL,
    modelOverride: env.JEV_MODEL,
  });
}

/**
 * List models — admin diagnostics and live tests only. Not on the hot path.
 * Reads `models[].name` (official); tolerates legacy `data[].id`.
 */
export async function listJevModels(input?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; names: string[]; access: JevAccessResolved }
  | { ok: false; error: JevErrorCode; message?: string }
> {
  const cred = await getCredential();
  if (!cred.access) {
    return { ok: false, error: "missing_credential" };
  }
  const timeout = input?.timeoutMs ?? env.JEV_TIMEOUT_MS;
  const secrets = [cred.apiKey].filter(Boolean);
  try {
    const res = await fetch(`${cred.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${cred.apiKey}` },
      signal: combineSignals(timeout, input?.signal),
    });
    if (!res.ok) {
      const mapped = statusToError(res.status);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      return {
        ok: false,
        error: mapped.error,
        message: clipMessage(body, secrets),
      };
    }
    const body = (await res.json()) as {
      models?: { name?: string; id?: string }[];
      data?: { name?: string; id?: string }[];
    };
    const list = body.models ?? body.data ?? [];
    const names = list
      .map((m) => {
        if (typeof m.name === "string" && m.name.trim()) return m.name.trim();
        if (typeof m.id === "string" && m.id.trim()) return m.id.trim();
        return "";
      })
      .filter(Boolean);
    return { ok: true, names, access: cred.access };
  } catch (err) {
    const message = err instanceof Error ? err.message : "network";
    const isTimeout = /abort|timeout/i.test(message);
    return {
      ok: false,
      error: isTimeout ? "timeout" : "network",
      message: clipMessage(message, secrets),
    };
  }
}

export async function callJevSystemOne(input: {
  state: CompactDecisionState | Record<string, unknown>;
  questions: JevQuestionsMap;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Test override — skip env credential resolution. */
  credential?: Extract<JevCredential, { access: JevAccessResolved }>;
}): Promise<JevCallResult> {
  const budgetMs = input.timeoutMs ?? env.JEV_TIMEOUT_MS;
  const started = Date.now();
  let attempts = 0;

  const cred =
    input.credential ??
    (await getCredential());
  if (!cred.access) {
    return {
      ok: false,
      error: "missing_credential",
      latencyMs: 0,
      attempts: 0,
      retryable: false,
    };
  }

  const url = `${cred.baseUrl}/v1/systemone`;
  const secrets = [cred.apiKey].filter(Boolean);
  const body: Record<string, unknown> = {
    model: cred.model,
    state: buildJevState(input.state as Record<string, unknown>),
    questions: input.questions,
  };
  if (cred.access === "gateway") {
    body.providerOptions = {
      gateway: { zeroDataRetention: true },
    };
  }

  const bodyJson = JSON.stringify(body);

  const attemptOnce = async (
    remainingMs: number,
  ): Promise<JevCallResult> => {
    attempts += 1;
    const attemptStarted = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.apiKey}`,
          "Content-Type": "application/json",
        },
        body: bodyJson,
        signal: combineSignals(remainingMs, input.signal),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        let errBody: unknown;
        try {
          errBody = await res.json();
        } catch {
          errBody = undefined;
        }
        const mapped = statusToError(res.status);
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterSec = retryAfterHeader
          ? Number(retryAfterHeader)
          : NaN;
        return {
          ok: false,
          error: mapped.error,
          status: res.status,
          message: clipMessage(errBody, secrets),
          latencyMs,
          attempts,
          retryable: mapped.retryable,
          ...(Number.isFinite(retryAfterSec)
            ? { retryAfterMs: Math.max(0, retryAfterSec * 1000) }
            : {}),
        } as JevCallFailure & { retryAfterMs?: number };
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        return {
          ok: false,
          error: "invalid_response",
          latencyMs,
          attempts,
          retryable: false,
          message: "response_not_json",
        };
      }

      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          ok: false,
          error: "invalid_response",
          latencyMs,
          attempts,
          retryable: false,
          message: clipMessage(parsed.error.message, secrets),
        };
      }

      const validated = validateAnswersAgainstQuestions(
        parsed.data.answers,
        input.questions,
      );
      if (!validated.ok) {
        return {
          ok: false,
          error: "invalid_response",
          latencyMs,
          attempts,
          retryable: false,
          message: validated.detail,
        };
      }

      const costRaw = parsed.data.provider_metadata?.gateway?.cost;
      const gatewayCostUsd =
        costRaw === undefined
          ? undefined
          : typeof costRaw === "number"
            ? costRaw
            : Number(costRaw);

      return {
        ok: true,
        raw: json,
        model: parsed.data.model,
        usage: {
          inputTokens: Number(parsed.data.usage?.input_tokens ?? 0),
          outputTokens: Number(parsed.data.usage?.output_tokens ?? 0),
        },
        gatewayCostUsd: Number.isFinite(gatewayCostUsd)
          ? gatewayCostUsd
          : undefined,
        access: cred.access,
        latencyMs,
        attempts,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : "network";
      const isTimeout =
        (err instanceof Error && err.name === "TimeoutError") ||
        /abort|timeout/i.test(message);
      void attemptStarted;
      return {
        ok: false,
        error: isTimeout ? "timeout" : "network",
        latencyMs,
        attempts,
        retryable: true,
        message: clipMessage(message, secrets),
      };
    }
  };

  // Total budget includes retries. At most one retry for retryable errors.
  const result = await attemptOnce(budgetMs);
  if (result.ok) return result;

  const failed = result as JevCallFailure & { retryAfterMs?: number };
  if (!failed.retryable || attempts >= 2) return failed;

  const elapsed = Date.now() - started;
  const remaining = budgetMs - elapsed;
  if (remaining < 80) return failed;

  const jitter = 40 + Math.floor(Math.random() * 80);
  const waitMs = Math.min(
    remaining - 50,
    Number.isFinite(failed.retryAfterMs)
      ? Math.max(jitter, failed.retryAfterMs ?? jitter)
      : jitter,
  );
  if (waitMs < 20) return failed;

  try {
    await sleep(waitMs, input.signal);
  } catch {
    return { ...failed, error: "timeout", retryable: false };
  }

  const afterWait = budgetMs - (Date.now() - started);
  if (afterWait < 50) return failed;
  return attemptOnce(afterWait);
}

/** Helper used by admin probe and tests. */
export function questionsForAllowed(
  allowed: LearningAction[],
): JevQuestionsMap {
  return defaultJevQuestions(allowed);
}
