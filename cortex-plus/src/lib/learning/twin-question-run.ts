import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient } from "@/lib/ai/openai-client";
import { contentModel } from "@/lib/ai/model-router";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";
import { normalizeQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel } from "@/lib/learning/teacher-tier";
import {
  TWIN_SYSTEM,
  TWO_OPTION_SYSTEM,
  readTwinQuestion,
  readTwoOptionHint,
  twinUserPrompt,
  twoOptionUserPrompt,
} from "@/lib/learning/twin-question";

/** Öğrenci soru ekranında bekliyor: kısa tavan, düşük düşünme. */
const TWIN_TIMEOUT_MS = 20_000;
const HINT_TIMEOUT_MS = 12_000;

/** Yoldaki testin kendi sorusu (sunucudaki kayıttan; tarayıcının gönderdiği metne güvenilmez). */
export async function loadAttemptQuizQuestion(
  service: SupabaseClient,
  input: { userId: string; attemptId: string; index: number },
): Promise<QuizQuestion | null> {
  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, user_id, payload")
    .eq("id", input.attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== input.userId) return null;
  const payload = (attempt.payload ?? {}) as { type?: string; questions?: unknown[] };
  if (payload.type !== "quiz" || !Array.isArray(payload.questions)) return null;
  const raw = Number.isInteger(input.index) && input.index >= 0 ? payload.questions[input.index] : null;
  return raw ? normalizeQuizQuestion(raw as Parameters<typeof normalizeQuizQuestion>[0]) : null;
}

async function askJson(service: SupabaseClient, userId: string, system: string, user: string, timeout: number) {
  const model = contentModel();
  const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout, maxRetries: 0 });
  const response = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    reasoning_effort: "low",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  // Kredi düşmez: dersin içinde kalan küçük yardım; maliyet bizde (kullanım kaydı ayrı kodla).
  await recordUsage(service, {
    userId,
    actionCode: "CONTENT_PREFETCH",
    model: billedModel(model, response.service_tier),
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  }).catch(() => undefined);
  return parseModelJson(response.choices[0]?.message?.content ?? "");
}

/** İkiz soruyu yazar; denetimden geçmezse bir kez daha dener, yine olmazsa null. */
export async function writeTwinQuestion(service: SupabaseClient, userId: string, original: QuizQuestion): Promise<QuizQuestion | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const twin = readTwinQuestion(await askJson(service, userId, TWIN_SYSTEM, twinUserPrompt(original), TWIN_TIMEOUT_MS), original);
      if (twin) return twin;
    } catch (error) {
      console.warn("twin_question_failed", error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  return null;
}

export async function writeTwoOptionHint(
  service: SupabaseClient,
  userId: string,
  question: QuizQuestion,
  pair: [string, string],
): Promise<string | null> {
  try {
    return readTwoOptionHint(
      await askJson(service, userId, TWO_OPTION_SYSTEM, twoOptionUserPrompt(question, pair), HINT_TIMEOUT_MS),
      question,
      pair,
    );
  } catch (error) {
    console.warn("two_option_hint_failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}
