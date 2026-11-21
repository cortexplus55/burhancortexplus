import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulDay } from "@/lib/istanbul-day";
import { missingRelation } from "@/lib/learning/missing-column";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";
import { isSensitiveNote, TUTOR_NOTES_TABLE } from "@/lib/tutor/memory-notes";

/*
  "Kaldığın yerden" açılışı (öğretmen v3, teacher.v2, 21 Kasım 2026, ürün sahibinin onayı). Karşılama ekranının ilk hapı:
  öğrencinin son 7 gündeki en yeni konuşmasının başlığından, yoksa en yeni "takıldığı nokta" öğretmen notundan tek
  satır. Modelsiz ve yalnız kayıttan: hiçbir kayıt yoksa null (uydurma yok). Konu adı kazanım kodu ve emoji taşımaz; iç
  sistem adı yazılmaz. Gün dili İstanbul günüyle (bugün / dün / N gün önce).
*/

export const RESUME_DAYS = 7;
const TOPIC_MAX = 60;
const NOTE_MAX = 120;
/** Henüz adlandırılmamış konuşmanın varsayılan başlığı: konu sayılmaz. */
const DEFAULT_TITLES = new Set(["yeni sohbet", "sohbet", "yeni konuşma"]);

export type TutorResume = { line: string; prompt: string; conversationId: string | null };

export type ResumeConversation = { id: string; title: string | null; updatedAt: string | null };
export type ResumeNote = { note: string; createdAt: string | null; conversationId: string | null };

const EMOJI = /\p{Extended_Pictographic}️?/gu;

/** Başlık → konu adı: ders etiketi ("[Ders] "), emoji, kazanım kodu ve tırnak yok; kısa. Varsayılan başlık boş döner. */
export function resumeTopic(title: string | null | undefined): string {
  const clean = withoutOutcomeCode(
    String(title ?? "")
      .replace(/^\s*\[[^\]\n]{1,40}\]\s*/, "")
      .replace(EMOJI, " ")
      .replace(/[«»"“”[\]\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).replace(/[.,;:!?…\s]+$/u, "");
  if (!clean || DEFAULT_TITLES.has(clean.toLocaleLowerCase("tr"))) return "";
  return clean.length > TOPIC_MAX ? `${clean.slice(0, TOPIC_MAX - 1).trimEnd()}…` : clean;
}

/** Kaydın İstanbul günü bugünden kaç gün önce; tarih okunamazsa null. */
export function daysAgo(at: string | null | undefined, now: Date): number | null {
  const ms = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return null;
  const then = Date.parse(`${istanbulDay(new Date(ms))}T00:00:00Z`);
  const today = Date.parse(`${istanbulDay(now)}T00:00:00Z`);
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

/** "Bugün" / "Dün" / "3 gün önce" (cümle başı). */
export function dayPhrase(days: number): string {
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

/**
 * Saf: en yeni konuşma (başlığı konu adıysa) önce; yoksa en yeni takıldığı nokta notu. İkisi de 7 günden eskiyse ya da
 * yoksa null.
 */
export function composeResume(input: {
  conversations: readonly ResumeConversation[];
  stuckNote: ResumeNote | null;
  now: Date;
}): TutorResume | null {
  for (const conversation of input.conversations) {
    const days = daysAgo(conversation.updatedAt, input.now);
    if (days == null || days > RESUME_DAYS) continue;
    const topic = resumeTopic(conversation.title);
    if (!topic) continue;
    return {
      line: `${dayPhrase(days)} «${topic}» konusunda kalmıştık, oradan devam edelim mi?`,
      prompt: `Geçen sefer kaldığımız yerden devam edelim: ${topic}.`,
      conversationId: conversation.id,
    };
  }
  const note = input.stuckNote;
  if (note) {
    const days = daysAgo(note.createdAt, input.now);
    const text = withoutOutcomeCode(String(note.note ?? "").replace(/\s+/g, " ").trim()).replace(/[.!…\s]+$/u, "");
    if (days != null && days <= RESUME_DAYS && text && !isSensitiveNote(text)) {
      const short = text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1).trimEnd()}…` : text;
      return {
        line: `${dayPhrase(days)} şunu not etmiştim: «${short}». Oradan devam edelim mi?`,
        prompt: `Geçen sefer kaldığımız yerden devam edelim: ${short}.`,
        conversationId: note.conversationId,
      };
    }
  }
  return null;
}

type Rows<T> = { data: T[] | null; error: { message?: string; code?: string } | null };

/**
 * İki küçük okuma (aynı anda, öğrencinin `user_id`'siyle, sınırlı): son 7 günün konuşmaları ve en yeni takıldığı nokta
 * notu. Bir okuma düşerse ya da not tablosu yoksa o kaynak yok sayılır; asla fırlatmaz.
 */
export async function loadTutorResume(service: SupabaseClient, userId: string, now: Date = new Date()): Promise<TutorResume | null> {
  const since = new Date(now.getTime() - (RESUME_DAYS + 1) * 86_400_000).toISOString();
  try {
    const [conversations, notes] = await Promise.all([
      Promise.resolve(
        service
          .from("conversations")
          .select("id, title, updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(5) as unknown as PromiseLike<Rows<{ id: string; title: string | null; updated_at: string | null }>>,
      ).catch(() => ({ data: [], error: { message: "failed" } })),
      Promise.resolve(
        service
          .from(TUTOR_NOTES_TABLE)
          .select("note, created_at, conversation_id")
          .eq("user_id", userId)
          .eq("kind", "stuck")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1) as unknown as PromiseLike<Rows<{ note: string | null; created_at: string | null; conversation_id: string | null }>>,
      ).catch(() => ({ data: [], error: { message: "failed" } })),
    ]);
    if (notes.error && !missingRelation(notes.error)) console.warn("tutor_resume_notes_unavailable");
    const note = notes.error ? null : (notes.data ?? [])[0] ?? null;
    return composeResume({
      conversations: (conversations.error ? [] : (conversations.data ?? [])).map((row) => ({
        id: String(row.id),
        title: row.title ?? null,
        updatedAt: row.updated_at ?? null,
      })),
      stuckNote: note
        ? { note: String(note.note ?? ""), createdAt: note.created_at ?? null, conversationId: note.conversation_id ?? null }
        : null,
      now,
    });
  } catch {
    return null;
  }
}
