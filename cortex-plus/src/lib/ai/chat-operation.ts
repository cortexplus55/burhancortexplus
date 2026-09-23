import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCitation } from "@/lib/ai/chat-citations";

export type SavedChatResult = {
  content: string; conversationId: string; messageId: string;
  creditsUsed: number; citations: ChatCitation[]; model: string;
};

export function chatRequestHash(request: unknown) {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export async function prepareChatOperation(service: SupabaseClient, input: {
  userId: string; operationId: string; requestHash: string; conversationId?: string;
}): Promise<{ ok: true; result: SavedChatResult | null } | { ok: false; status: number; error: string }> {
  if (input.conversationId) {
    const { data, error } = await service.from("conversations").select("id")
      .eq("id", input.conversationId).eq("user_id", input.userId).is("deleted_at", null).maybeSingle();
    if (error) return { ok: false, status: 503, error: "Sohbete şu an erişilemiyor." };
    if (!data) return { ok: false, status: 404, error: "Sohbet bulunamadı." };
  }
  const { error } = await service.from("chat_operations").upsert({
    id: input.operationId, user_id: input.userId, request_hash: input.requestHash,
    conversation_id: input.conversationId ?? null,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) return { ok: false, status: 503, error: "İşlem kaydedilemedi. Yeniden dene." };
  const { data: op, error: readError } = await service.from("chat_operations").select("request_hash,result")
    .eq("id", input.operationId).eq("user_id", input.userId).maybeSingle();
  if (readError || !op) return { ok: false, status: 503, error: "İşleme şu an erişilemiyor." };
  if (op.request_hash !== input.requestHash) return { ok: false, status: 409, error: "Bu işlem kimliği başka bir soru için kullanılmış." };
  return { ok: true, result: op.result as SavedChatResult | null };
}

export function chatResultResponse(result: SavedChatResult, documentsOnly: boolean) {
  return new Response(result.content, { headers: {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "X-Conversation-Id": result.conversationId, "X-Message-Id": result.messageId,
    "X-Credits-Used": String(result.creditsUsed), "X-Model": result.model,
    "X-Sources": String(result.citations.length), "X-Documents-Only": documentsOnly ? "1" : "0",
    "X-Source-Doc": encodeURIComponent(result.citations[0]?.documentName ?? ""),
    "X-Source-Page": String(result.citations[0]?.pageNumber ?? ""),
  } });
}
