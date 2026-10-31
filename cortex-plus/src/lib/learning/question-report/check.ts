import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient } from "@/lib/ai/openai-client";
import { contentModel } from "@/lib/ai/model-router";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { billedModel } from "@/lib/learning/teacher-tier";
import type { ReportReason } from "@/lib/learning/question-report/copy";
import {
  REPORT_CHECK_SYSTEM,
  readReportDecision,
  reportCheckUserPrompt,
  type ReportDecision,
  type ReportedQuestion,
} from "@/lib/learning/question-report/decision";

/** Öğrenci yanıtı bekliyor; denetim bu süreyi aşarsa bildirim "kontrol edemedik" döner, ödül ya da düzeltme yok. */
export const REPORT_CHECK_TIMEOUT_MS = 25_000;

/**
 * Bildirilen soruyu tek model çağrısıyla denetler (31 Ekim 2026, Paket J2 #10). Model soruyu kendisi çözer; orta
 * düşünme: yanlış bir "hatalı" kararı doğru soruyu geçersiz sayar ve ödül verir. Kredi düşmez (kullanım kaydı
 * CONTENT_PREFETCH koduyla, bizim maliyetimiz). Çağrı düşerse ya da cevap okunamazsa `null`.
 */
export async function checkReportedQuestion(
  service: SupabaseClient,
  input: { userId: string; question: ReportedQuestion; reason: ReportReason; note: string | null },
): Promise<ReportDecision | null> {
  const model = contentModel();
  const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: REPORT_CHECK_TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      reasoning_effort: "medium",
      messages: [
        { role: "system", content: REPORT_CHECK_SYSTEM },
        { role: "user", content: reportCheckUserPrompt(input.question, input.reason, input.note) },
      ],
    });
    await recordUsage(service, {
      userId: input.userId,
      actionCode: "CONTENT_PREFETCH",
      model: billedModel(model, response.service_tier),
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    return readReportDecision(parseModelJson(response.choices[0]?.message?.content ?? ""), input.question);
  } catch (error) {
    console.warn("question_report_check_failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}
