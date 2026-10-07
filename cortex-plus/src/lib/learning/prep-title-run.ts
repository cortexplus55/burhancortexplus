import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { recordUsage } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { PREP_TITLE_SYSTEM, prepTitleFromModel, prepTitleUserPrompt } from "@/lib/learning/prep-title";

/**
 * Hazırlığın adını ana konulardan yazdırır (tek kısa luna çağrısı, 0 kredi;
 * kullanım PREP_TITLE). Model yoksa ya da ad geçmezse null.
 */
export async function namePrepFromTopics(
  service: SupabaseClient,
  input: { userId: string; topics: string[]; subject?: string | null },
): Promise<string | null> {
  if (!env.OPENAI_API_KEY || input.topics.length < 2) return null;
  try {
    const model = contentModel();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PREP_TITLE_SYSTEM },
        { role: "user", content: prepTitleUserPrompt(input) },
      ],
    });
    void recordUsage(service, {
      userId: input.userId,
      actionCode: "PREP_TITLE",
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    return prepTitleFromModel(parseModelJson(response.choices[0]?.message?.content ?? ""));
  } catch (error) {
    console.error("prep_title_failed", { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
    return null;
  }
}
