import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentModel } from "@/lib/ai/model-router";

/*
  Sohbetten çözülen sorunun sohbete yazılması (23 Ekim 2026). Kredi çözücüde düştü; burada yalnız iki satır yazılır
  (öğrenci + cevap). Sohbet öğrencinin değilse ya da silinmişse yeni sohbet açılır. Yazım düşerse çözüm yine
  ekranda kalır; yalnız sohbet geçmişinde görünmez.
*/
export async function saveSolveToChat(
  service: SupabaseClient,
  input: { userId: string; conversationId?: string; userMessage: string; content: string },
): Promise<{ conversationId: string; messageId: string; created: boolean } | null> {
  let conversationId: string | null = null;
  if (input.conversationId) {
    const { data } = await service.from("conversations").select("id")
      .eq("id", input.conversationId).eq("user_id", input.userId).is("deleted_at", null).maybeSingle();
    conversationId = (data?.id as string | undefined) ?? null;
  }
  const created = !conversationId;
  if (!conversationId) {
    const { data, error } = await service.from("conversations")
      .insert({ user_id: input.userId, title: input.userMessage.replace(/^📷\s*/u, "").slice(0, 60) })
      .select("id").single();
    if (error || !data) return null;
    conversationId = data.id as string;
  }
  const { error: userError } = await service.from("messages")
    .insert({ conversation_id: conversationId, user_id: input.userId, role: "user", content: input.userMessage });
  if (userError) return null;
  const { data: saved, error } = await service.from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: input.userId,
      role: "assistant",
      content: input.content,
      model: contentModel(),
      citations: [],
    })
    .select("id").single();
  if (error || !saved) return null;
  await service.from("conversations").update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId).eq("user_id", input.userId);
  return { conversationId, messageId: saved.id as string, created };
}
