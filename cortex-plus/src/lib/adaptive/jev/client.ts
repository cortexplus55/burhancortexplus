/**
 * TypeSafe Jev HTTP client — server-only. Never expose TYPESAFE_API_KEY.
 */

import "server-only";
import { env } from "@/lib/env";
import type { CompactDecisionState } from "@/lib/adaptive/types";

const SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const MODELS_URL = "https://api.typesafe.ai/v1/models";

export type JevQuestion =
  | {
      name: string;
      type: "choice";
      allowed: string[];
    }
  | {
      name: string;
      type: "noul";
    }
  | {
      name: string;
      type: "score";
      min?: number;
      max?: number;
    };

let cachedModel: string | null = null;
let lastModelDiagnostic: string | null = null;

export function getLastJevModelDiagnostic(): string | null {
  return lastModelDiagnostic;
}

async function listAvailableJevModels(key: string): Promise<string[]> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(env.JEV_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: { id?: string }[];
      models?: { id?: string }[];
    };
    const list = body.data ?? body.models ?? [];
    return list
      .map((m) => (typeof m.id === "string" ? m.id.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve Jev model. If JEV_MODEL is set but unavailable, log a precise
 * diagnostic and fall back to the first supported model (or systemone).
 */
export async function resolveJevModel(): Promise<string> {
  const key = env.TYPESAFE_API_KEY?.trim();
  const configured = env.JEV_MODEL?.trim() || null;

  if (configured && !key) {
    lastModelDiagnostic = `JEV_MODEL=${configured} set but TYPESAFE_API_KEY missing; using configured id as-is.`;
    return configured;
  }

  if (!key) {
    lastModelDiagnostic = null;
    return configured ?? "systemone";
  }

  const available = await listAvailableJevModels(key);

  if (configured) {
    if (available.length === 0) {
      // Models endpoint failed — keep configured; call path will surface errors.
      lastModelDiagnostic = `JEV_MODEL=${configured}; /v1/models unreachable — proceeding with configured model.`;
      return configured;
    }
    if (available.includes(configured)) {
      lastModelDiagnostic = null;
      cachedModel = configured;
      return configured;
    }
    const fallback = available[0] ?? "systemone";
    lastModelDiagnostic = `JEV_MODEL=${configured} unavailable. Available=[${available.join(", ")}]. Falling back to ${fallback}.`;
    console.warn(`[adaptive/jev] ${lastModelDiagnostic}`);
    cachedModel = fallback;
    return fallback;
  }

  if (cachedModel) return cachedModel;
  const first = available[0] ?? "systemone";
  cachedModel = first;
  lastModelDiagnostic = null;
  return cachedModel;
}

export function defaultJevQuestions(allowedActions: string[]): JevQuestion[] {
  return [
    { name: "next_action", type: "choice", allowed: allowedActions },
    {
      name: "teaching_mode",
      type: "choice",
      allowed: [
        "concise_explanation",
        "step_by_step",
        "worked_example",
        "socratic",
        "analogy",
        "visual_first",
        "formula_first",
        "retrieval_first",
      ],
    },
    {
      name: "difficulty",
      type: "choice",
      allowed: ["foundation", "easy", "medium", "hard", "exam_level"],
    },
    { name: "misconception_severity", type: "score", min: 0, max: 3 },
    { name: "needs_prerequisite_review", type: "noul" },
    { name: "ready_to_advance", type: "noul" },
    { name: "needs_gpt4o", type: "noul" },
    { name: "needs_daily_replan", type: "noul" },
  ];
}

export async function callJevSystemOne(input: {
  state: CompactDecisionState;
  questions: JevQuestion[];
  timeoutMs?: number;
}): Promise<{ ok: true; raw: unknown; latencyMs: number } | { ok: false; error: string; latencyMs: number }> {
  const key = env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "missing_api_key", latencyMs: 0 };
  }
  const timeout = input.timeoutMs ?? env.JEV_TIMEOUT_MS;
  const model = await resolveJevModel();
  const started = Date.now();
  try {
    const res = await fetch(SYSTEMONE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        state: input.state,
        questions: input.questions,
      }),
      signal: AbortSignal.timeout(timeout),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        error: `http_${res.status}`,
        latencyMs,
      };
    }
    const raw = await res.json();
    return { ok: true, raw, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : "jev_error";
    const isTimeout = /abort|timeout/i.test(message);
    return {
      ok: false,
      error: isTimeout ? "timeout" : message,
      latencyMs,
    };
  }
}
