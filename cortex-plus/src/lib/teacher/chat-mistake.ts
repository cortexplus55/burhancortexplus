import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { miniQuizHref } from "@/lib/teacher/reply-chips";

/*
  "📝 Bunu Yanlışlar Defterime ekle" (Faz 11, teacher.v2, 21 Kasım 2026). Öğretmenin bir yanıtı ve hemen öncesindeki
  öğrenci sorusu defterin bugünkü satır biçimiyle yazılır (`mistake_entries`; kaynak `chat`, kimlik `source_ref` =
  `chat:<mesaj>`). Sohbette anahtar olmadığı için `options` ve `correct_answer` boş kalır; defter onu kendini yoklama
  kartı olarak sorar (`CHAT_SELF_CHECK_OPTIONS`). Sahiplik sunucuda: konuşma ve mesaj öğrencinin kendisinin olmalı. Aynı
  mesaj ikinci kez eklenmez (var olan satır aynen döner; yanlış sayacı artmaz).
*/

export const CHAT_MISTAKE_SOURCE = "chat";
const QUESTION_MAX = 1000;
const EXPLANATION_MAX = 1200;
const TOPIC_MAX = 80;

export type ChatMistakeResult =
  | { ok: true; already: boolean; entryId: string | null; topic: string | null; quizHref: string }
  | { ok: false; status: 404 | 422 | 503; error: string };

export const chatMistakeRef = (messageId: string) => `chat:${messageId.toLowerCase()}`;

/** Sunucunun eklediği işaretler ([[…]]) ve kaynak listesi defter metnine girmez. */
export function plainReply(content: string): string {
  return String(content ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\n+Kaynaklar:\n[\s\S]*$/u, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Genel sohbetteki ders etiketi ("[Ders] …") sorunun parçası değildir. */
function plainQuestion(content: string): string {
  return plainReply(content).replace(/^\s*\[[^\]\n]{1,40}\]\s*/, "").trim();
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Konuşmanın başlığı konu etiketi olur (emoji ve fazla boşluk atılır); yoksa defter "Konusu belirsiz" altında toplar. */
export function topicFromTitle(title: string | null | undefined): string | null {
  const text = String(title ?? "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? clip(text, TOPIC_MAX) : null;
}

type DbError = { code?: string | null; message?: string | null } | null;
type One<T> = { data: T | null; error: DbError };
type Many<T> = { data: T[] | null; error: DbError };

export async function saveChatMistake(
  service: SupabaseClient,
  userId: string,
  input: { conversationId: string; messageId: string },
): Promise<ChatMistakeResult> {
  const [conversation, message] = await Promise.all([
    service
      .from("conversations")
      .select("id, title")
      .eq("id", input.conversationId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle() as unknown as PromiseLike<One<{ id: string; title: string | null }>>,
    service
      .from("messages")
      .select("id, role, content, created_at")
      .eq("id", input.messageId)
      .eq("conversation_id", input.conversationId)
      .eq("user_id", userId)
      .maybeSingle() as unknown as PromiseLike<One<{ id: string; role: string; content: string; created_at: string }>>,
  ]);
  if (conversation.error || message.error) return { ok: false, status: 503, error: "unavailable" };
  if (!conversation.data || !message.data) return { ok: false, status: 404, error: "not_found" };
  if (message.data.role !== "assistant") return { ok: false, status: 422, error: "not_a_reply" };

  const topic = topicFromTitle(conversation.data.title);
  const ref = chatMistakeRef(input.messageId);
  const existing = (await (service
    .from("mistake_entries")
    .select("id, question_text")
    .eq("user_id", userId)
    .eq("source_ref", ref)
    .limit(1) as unknown as PromiseLike<Many<{ id: string; question_text: string | null }>>));
  if (existing.error) return { ok: false, status: 503, error: "unavailable" };
  const quizHref = (question: string | null) => miniQuizHref({ topic, question });
  if (existing.data?.length) {
    const row = existing.data[0]!;
    return { ok: true, already: true, entryId: row.id, topic, quizHref: quizHref(row.question_text) };
  }

  // Aynı turun öğrenci mesajı aynı işlemde yazılır (aynı zaman damgası): "≤" ile en yakın öğrenci mesajı.
  const asked = (await (service
    .from("messages")
    .select("content")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", userId)
    .eq("role", "user")
    .lte("created_at", message.data.created_at)
    .order("created_at", { ascending: false })
    .limit(1) as unknown as PromiseLike<Many<{ content: string }>>));
  if (asked.error) return { ok: false, status: 503, error: "unavailable" };
  const question = clip(plainQuestion(asked.data?.[0]?.content ?? ""), QUESTION_MAX);
  if (!question) return { ok: false, status: 422, error: "no_question" };
  const explanation = clip(plainReply(message.data.content), EXPLANATION_MAX) || null;

  const { data: inserted, error } = (await (service
    .from("mistake_entries")
    .insert({
      user_id: userId,
      source: CHAT_MISTAKE_SOURCE,
      source_question_id: null,
      source_ref: ref,
      topic_label: topic,
      question_text: question,
      options: null,
      correct_answer: null,
      first_wrong_answer: null,
      explanation,
    })
    .select("id")
    .maybeSingle() as unknown as PromiseLike<One<{ id: string }>>));
  if (error) {
    // Eşzamanlı iki dokunuş: tekil indeks ikinciyi reddeder; var olan satır döner.
    if (error.code === "23505") {
      const again = (await (service
        .from("mistake_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("source_ref", ref)
        .limit(1) as unknown as PromiseLike<Many<{ id: string }>>));
      return { ok: true, already: true, entryId: again.data?.[0]?.id ?? null, topic, quizHref: quizHref(question) };
    }
    // Kaynak kısıtı `chat`'i henüz tanımıyor (göç uygulanmadı): kayıt açılamaz, öğrenciye "şu an olmadı" denir.
    if (error.code === "23514") return { ok: false, status: 503, error: "not_ready" };
    console.error("teacher_mistake_write_failed", { code: error.code ?? null });
    return { ok: false, status: 503, error: "unavailable" };
  }
  return { ok: true, already: false, entryId: inserted?.id ?? null, topic, quizHref: quizHref(question) };
}
