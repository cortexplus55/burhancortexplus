import "server-only";
import { samplingParams } from "@/lib/ai/model-params";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { cleanConversationTitle } from "@/lib/ai/conversation-title-text";

const SYSTEM =
  "Bir öğrenci sohbetine kısa Türkçe başlık ver. 2-6 kelime; konunun adı olsun " +
  '("Mol, Gazlar ve Stokiyometri Çalışması" gibi). Sonuna konuyla ilgili tek bir emoji koy. ' +
  'Tırnak, nokta, "Başlık:" yazma. Yalnızca başlığı döndür.';

/**
 * Yeni sohbetin ilk cevabından sonra başlığı yazar.
 *
 * Astra her sohbete kısa bir başlık ve emoji veriyor; bizde ilk mesajın
 * ilk 60 harfi duruyordu ("[Matematik] Bosluk orani ile porozite arasindaki
 * iliski nedi"). Ürün sahibi Astra gibi olmasını seçti (30 Eylül 2026).
 *
 * Öğrenciden ücret alınmaz, cevabı geciktirmez (çağıran `after()` ile
 * çalıştırır). Başarısız olursa eski başlık kalır.
 */
export async function titleConversation(
  service: SupabaseClient,
  input: { userId: string; conversationId: string; message: string; answer: string },
): Promise<void> {
  if (!env.OPENAI_API_KEY) return;
  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
    const model = env.OPENAI_LESSON_FREE_MODEL;
    const question = input.message.replace(/^\[[^\]]{1,40}\]\s*/, "").slice(0, 500);
    const response = await openai.chat.completions.create({
      model,
      ...samplingParams(model, { temperature: 0.3, maxTokens: 40 }),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Öğrenci: ${question}\n\nCevap: ${input.answer.slice(0, 700)}` },
      ],
    });
    void recordUsage(service, {
      userId: input.userId,
      actionCode: "CHAT_TITLE",
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    const title = cleanConversationTitle(response.choices[0]?.message?.content ?? "");
    if (!title) return;
    await service
      .from("conversations")
      .update({ title })
      .eq("id", input.conversationId)
      .eq("user_id", input.userId);
  } catch (error) {
    console.warn("conversation_title_failed", {
      conversationId: input.conversationId,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
}
