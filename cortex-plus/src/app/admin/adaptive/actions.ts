"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  callJevSystemOne,
  listJevModels,
  defaultJevQuestions,
} from "@/lib/adaptive/jev/client";
import { normalizeJevAnswers } from "@/lib/adaptive/jev/normalize";
import { estimateTokenCostUsd } from "@/lib/adaptive/analytics";
import type { LearningAction } from "@/lib/adaptive/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PILOT_FLAGS = [
  "adaptive_learning_enabled",
  "jev_enabled",
  "adaptive_daily_replan_enabled",
  "adaptive_model_router_enabled",
] as const;

async function requireAdminActor(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  return data ? user.id : null;
}

const pilotSchema = z.object({
  flagKey: z.enum(PILOT_FLAGS),
  userId: z.string().regex(UUID_RE),
  op: z.enum(["add", "remove"]),
});

export async function updateAdaptivePilotUser(input: {
  flagKey: string;
  userId: string;
  op: "add" | "remove";
}): Promise<{ ok: true; pilotIds: string[] } | { ok: false; error: string }> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = pilotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz UUID veya bayrak." };

  const service = createServiceClient();
  const { data: row, error } = await service
    .from("feature_flags")
    .select("key, metadata")
    .eq("key", parsed.data.flagKey)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      error: `Bayrak satırı bulunamadı: ${parsed.data.flagKey}. Satır oluşturulmaz.`,
    };
  }

  const meta =
    row.metadata && typeof row.metadata === "object"
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};
  const existing = Array.isArray(meta.pilot_user_ids)
    ? meta.pilot_user_ids.filter((id): id is string => typeof id === "string")
    : [];

  let next = existing;
  if (parsed.data.op === "add") {
    if (!existing.includes(parsed.data.userId)) {
      next = [...existing, parsed.data.userId];
    }
  } else {
    next = existing.filter((id) => id !== parsed.data.userId);
  }

  const { error: updErr } = await service
    .from("feature_flags")
    .update({ metadata: { ...meta, pilot_user_ids: next } })
    .eq("key", parsed.data.flagKey);

  if (updErr) return { ok: false, error: "Güncelleme başarısız." };

  revalidatePath("/admin/adaptive");
  return { ok: true, pilotIds: next };
}

export async function addSelfToAdaptivePilots(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  for (const flagKey of PILOT_FLAGS) {
    const r = await updateAdaptivePilotUser({
      flagKey,
      userId: actorId,
      op: "add",
    });
    if (!r.ok && !r.error.includes("bulunamadı")) {
      return r;
    }
  }
  return { ok: true };
}

export async function testJevConnection(): Promise<
  | {
      ok: true;
      status: string;
      latencyMs: number;
      model: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      access: string;
      summary: string;
    }
  | { ok: false; error: string; latencyMs?: number }
> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const allowed: LearningAction[] = [
    "teach",
    "practice",
    "reteach",
    "worked_example",
  ];
  const state = {
    student: {
      exam_days_remaining: 14,
      session_minutes_remaining: 30,
      fatigue_signal: 0.2,
    },
    objective: {
      topic_id: "synthetic-topic",
      mastery: 0.4,
      mastery_confidence: 0.5,
      recent_accuracy: 0.5,
      attempt_count: 2,
    },
    evidence: {
      last_answer_correct: false,
      hint_count: 0,
      repeated_misconception: false,
    },
    plan: { today_target: "Synthetic probe", behind_schedule: false },
    allowed_actions: allowed,
  };

  const result = await callJevSystemOne({
    state,
    questions: defaultJevQuestions(allowed),
    timeoutMs: 8_000,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.message
        ? `${result.error}: ${result.message}`
        : result.error,
      latencyMs: result.latencyMs,
    };
  }

  const normalized = normalizeJevAnswers(result.raw, {
    allowedActions: allowed,
    provider: "jev",
    latencyMs: result.latencyMs,
  });

  const cost =
    result.gatewayCostUsd ??
    estimateTokenCostUsd(
      result.model,
      result.usage.inputTokens,
      result.usage.outputTokens,
    );

  return {
    ok: true,
    status: "ok",
    latencyMs: result.latencyMs,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    estimatedCostUsd: cost,
    access: result.access,
    summary: normalized.ok
      ? `action=${normalized.result.action} conf=${normalized.result.confidence.toFixed(2)}`
      : `normalize_failed:${normalized.detail}`,
  };
}

export async function listJevModelsAction(): Promise<
  | { ok: true; names: string[]; access: string }
  | { ok: false; error: string }
> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const result = await listJevModels({ timeoutMs: 8_000 });
  if (!result.ok) {
    return {
      ok: false,
      error: result.message ? `${result.error}: ${result.message}` : result.error,
    };
  }
  return { ok: true, names: result.names, access: result.access };
}
