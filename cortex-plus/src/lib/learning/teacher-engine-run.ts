import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

export type TeacherRunOutcome<R> =
  | { ok: true; result: R; calls: number; ms: number }
  | { ok: false; status: number; error: string; reasons: string[] };

/**
 * Öğretmen motorlarının ortak kabuğu: kredi bir kez ayrılır, her model
 * çağrısı kullanım olarak kaydedilir; iş sonucu kabul edilirse kredi
 * kesinleşir, edilmezse ya da hata olursa iade edilir.
 */
export async function runWithTeacherModel<R>(
  service: SupabaseClient,
  options: {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    startedAt?: number;
    /** Günlük satırının adı ("teacher_cards"). */
    label: string;
    topic: string;
    work: (ask: AskJson, started: number) => Promise<{ ok: true; result: R; log?: Record<string, unknown> } | { ok: false; reasons: string[]; log?: Record<string, unknown> }>;
  },
): Promise<TeacherRunOutcome<R>> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  const reservation = await reserveCredits(service, options.userId, options.actionCode, options.idempotencyKey);
  if (!reservation.ok) {
    return {
      ok: false,
      status: reservation.reason === "insufficient_credits" ? 402 : 409,
      error: reservation.reason,
      reasons: [],
    };
  }
  const started = options.startedAt ?? Date.now();
  const model = contentModel();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  const ask: AskJson = async (system, user) => {
    calls += 1;
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    await recordUsage(service, {
      userId: options.userId,
      actionCode: options.actionCode,
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId: reservation.reservationId,
    }).catch(() => undefined);
    return parseModelJson(response.choices[0]?.message?.content ?? "");
  };

  try {
    const outcome = await options.work(ask, started);
    console.info(options.label, { topic: options.topic.slice(0, 80), ok: outcome.ok, calls, ms: Date.now() - started, ...outcome.log });
    if (!outcome.ok) {
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
      return { ok: false, status: 503, error: "generation_failed", reasons: outcome.reasons.slice(0, 6) };
    }
    await commitCredits(service, reservation.reservationId);
    return { ok: true, result: outcome.result, calls, ms: Date.now() - started };
  } catch (error) {
    await refundCredits(service, reservation.reservationId).catch(() => undefined);
    console.error(`${options.label}_failed`, {
      topic: options.topic.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}
