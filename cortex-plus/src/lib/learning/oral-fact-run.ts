import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { contentModel } from "@/lib/ai/model-router";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  ORAL_FACT_SYSTEM,
  ORAL_FACT_TIMEOUT_MS,
  parseFactFindings,
  type FactFinding,
} from "@/lib/learning/oral-fact-check";

type FactQuestion = { prompt?: string; expectedPoints?: string[] };

/**
 * Puanlamadan önce tek olgu çağrısı. Öğrenciden ikinci kez kredi düşmez
 * (ayrım yok). Süre dolunca boş liste: deterministik yedek puanlamada çalışır.
 */
export async function collectOralFactFindings(input: {
  service: SupabaseClient;
  userId: string;
  questions: FactQuestion[];
  answers: Record<string, unknown>;
  source: string;
}): Promise<FactFinding[]> {
  if (!env.OPENAI_API_KEY) return [];
  const lines = input.questions
    .map((question, index) => {
      const answer = String(input.answers[String(index)] ?? "").trim();
      const points = (question.expectedPoints ?? []).join(" | ");
      return [`Soru ${index}`, `Soru: ${question.prompt ?? ""}`, `Beklenen: ${points}`, `Cevap: ${answer || "(boş)"}`].join("\n");
    })
    .join("\n\n");
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: ORAL_FACT_TIMEOUT_MS, maxRetries: 0 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORAL_FACT_TIMEOUT_MS);
  try {
    const response = await openai.chat.completions.create(
      {
        model: contentModel(),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ORAL_FACT_SYSTEM },
          { role: "user", content: `Kaynak:\n${input.source.slice(0, 6000)}\n\n${lines}` },
        ],
      },
      { signal: controller.signal },
    );
    await recordUsage(input.service, {
      userId: input.userId,
      actionCode: "PRACTICE_EXAM_GRADE",
      model: contentModel(),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
      reservationId: null,
    }).catch(() => undefined);
    return parseFactFindings(parseModelJson(response.choices[0]?.message?.content ?? ""));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
