import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { parseModelJson } from "@/lib/learning/teaching-standards";

/**
 * Bozuk parçayı bir kez yeniden yazar.
 *
 * Kredi burada ayrılmaz: dersin rezervasyonu generateJson içinde
 * zaten tutuldu. Bu çağrı yalnızca jeton kaydı düşer.
 */
export async function completeLessonPartRepair(input: {
  service: SupabaseClient;
  userId: string;
  prompt: string;
}): Promise<unknown> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 45_000,
      maxRetries: 0,
    });
    const response = await openai.chat.completions.create({
      model: env.OPENAI_STANDARD_MODEL,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Bozuk ders parçalarını kaynak cümleleriyle yeniden yaz. Yeni olgu, sayı ve formül uydurma. Yalnızca istenen JSON'u döndür.",
        },
        { role: "user", content: input.prompt },
      ],
    });
    const usage = response?.usage;
    void recordUsage(input.service, {
      userId: input.userId,
      actionCode: "STUDY_PLAN_GENERATE",
      model: env.OPENAI_STANDARD_MODEL,
      tokensIn: usage?.prompt_tokens ?? 0,
      tokensOut: usage?.completion_tokens ?? 0,
      reservationId: null,
    }).catch(() => undefined);
    return parseModelJson(response?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}
