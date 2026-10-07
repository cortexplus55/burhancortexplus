import "server-only";
import { samplingParams } from "@/lib/ai/model-params";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  applyMainGroups,
  mainGroupingPrompt,
  type MainTopic,
  type SubTopic,
} from "@/lib/documents/topic-main-groups";

/**
 * Alt başlıkları tek model çağrısıyla ana konulara toplar.
 *
 * Belge başına bir kez; öğrenciden ücret alınmaz (harita zaten pencere
 * başına ücretlendi), maliyet TOPIC_MAP_GROUP olarak kaydedilir. Her türlü
 * hatada null: harita gruplanmadan kaydedilir, belge kaybolmaz.
 */
export async function groupIntoMainTopics(
  service: SupabaseClient,
  input: { userId: string; fileName: string; subs: SubTopic[] },
): Promise<MainTopic[] | null> {
  if (!env.OPENAI_API_KEY || !input.subs.length) return null;
  const model = env.OPENAI_ADVANCED_MODEL;
  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model,
      ...samplingParams(model, { temperature: 0.2, maxTokens: 3000 }),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Uzun bir ders belgesinin alt başlıklarını ana konulara topluyorsun. Yalnızca istenen JSON'u döndür.",
        },
        { role: "user", content: mainGroupingPrompt(input.fileName, input.subs) },
      ],
    });
    void recordUsage(service, {
      userId: input.userId,
      actionCode: "TOPIC_MAP_GROUP",
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    const grouped = applyMainGroups(input.subs, parseModelJson(response.choices[0]?.message?.content ?? ""));
    if (!grouped) console.warn("topic_map_group_rejected", { subs: input.subs.length });
    return grouped;
  } catch (error) {
    console.warn("topic_map_group_failed", {
      subs: input.subs.length,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}
