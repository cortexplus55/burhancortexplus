import {
  BOARD_CARD_MAX,
  TRANSCRIPT_MAX_CHARS,
  TRANSCRIPT_MAX_TURNS,
  TRANSCRIPT_TURN_MAX_CHARS,
  type BoardCard,
  type RealtimeTranscriptTurn,
} from "@/lib/tutor/realtime/config";
import { boardCardMarkdown, sanitizeBoardCard } from "@/lib/tutor/realtime/board-cards";

/*
  Sesli dersin sohbete kaydı (21 Kasım 2026). Oturum bitince söylenenler öğrencinin normal sohbet geçmişine kalıcı
  yazılır (yalnız metin; ses saklanmaz). Metin istemcinin canlı dökümünden gelir; uç her satırı doğrular: rol yalnız
  öğrenci / öğretmen, boş satır düşer, satır ve toplam boy sınırlı, sıra korunur. Art arda aynı rolün satırları tek
  mesajda birleşir (öğretmenin araçtan sonra sürdürdüğü konuşma tek cevap gibi okunur). Tahta kartları hangi
  konuşmanın ardından geldiyse o öğretmen mesajının sonuna, sohbetin formül kartı / kilit bilgi biçimiyle eklenir.
*/

export type SavedTurn = { role: "user" | "assistant"; content: string };

 
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Konuşma satırlarını doğrular; sıra korunur. */
export function sanitizeTurns(raw: unknown): RealtimeTranscriptTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: RealtimeTranscriptTurn[] = [];
  let total = 0;
  for (const item of raw.slice(0, TRANSCRIPT_MAX_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;
    const text = String((item as { text?: unknown }).text ?? "")
      .replace(CONTROL, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, TRANSCRIPT_TURN_MAX_CHARS);
    if (!text) continue;
    if (total + text.length > TRANSCRIPT_MAX_CHARS) break;
    total += text.length;
    out.push({ role, text });
  }
  return out;
}

export type RawCard = { kind?: unknown; title?: unknown; body?: unknown; afterTurn?: unknown };

/** Kartları doğrular; `afterTurn` ham satır dizinidir (doğrulamadan önceki dizi), yoksa sona. */
export function sanitizeCards(raw: unknown): (Omit<BoardCard, "id"> & { afterTurn: number | null })[] {
  if (!Array.isArray(raw)) return [];
  const out: (Omit<BoardCard, "id"> & { afterTurn: number | null })[] = [];
  for (const item of raw) {
    if (out.length >= BOARD_CARD_MAX) break;
    if (!item || typeof item !== "object") continue;
    const card = sanitizeBoardCard(item as RawCard);
    if (!card) continue;
    const after = Number((item as RawCard).afterTurn);
    out.push({ ...card, afterTurn: Number.isInteger(after) && after >= 0 ? after : null });
  }
  return out;
}

/**
 * Satırlar + kartlar → kaydedilecek mesajlar. `rawTurns` ham dizi (kartın `afterTurn`'ü onu gösterir); kart bir öğrenci
 * satırını gösteriyorsa ardından gelen ilk öğretmen mesajına, o da yoksa sona yeni bir öğretmen mesajı olarak eklenir.
 */
export function composeSavedTurns(rawTurns: unknown, rawCards: unknown): SavedTurn[] {
  const source = Array.isArray(rawTurns) ? rawTurns.slice(0, TRANSCRIPT_MAX_TURNS) : [];
  const cards = sanitizeCards(rawCards);
  const messages: SavedTurn[] = [];
  /** Ham satır dizini → mesaj dizini (birleşmeden sonra). */
  const messageOfRaw = new Map<number, number>();
  let total = 0;
  source.forEach((item, rawIndex) => {
    const [turn] = sanitizeTurns([item]);
    if (!turn || total + turn.text.length > TRANSCRIPT_MAX_CHARS) return;
    total += turn.text.length;
    const last = messages[messages.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.text}`;
    } else {
      messages.push({ role: turn.role, content: turn.text });
    }
    messageOfRaw.set(rawIndex, messages.length - 1);
  });
  const pending: string[] = [];
  const attach = new Map<number, string[]>();
  for (const card of cards) {
    const markdown = boardCardMarkdown(card);
    let target: number | null = null;
    if (card.afterTurn != null) {
      // Kartın gösterdiği satır ya da ondan önceki en yakın kayıtlı satır.
      for (let index = Math.min(card.afterTurn, source.length - 1); index >= 0 && target == null; index -= 1) {
        const message = messageOfRaw.get(index);
        if (message != null) target = message;
      }
    }
    if (target != null && messages[target]?.role === "user") {
      const next = messages.findIndex((message, index) => index > target! && message.role === "assistant");
      target = next >= 0 ? next : null;
    }
    if (target == null) {
      pending.push(markdown);
      continue;
    }
    attach.set(target, [...(attach.get(target) ?? []), markdown]);
  }
  for (const [index, blocks] of attach) {
    const message = messages[index];
    if (message) message.content = `${message.content}\n\n${blocks.join("\n\n")}`;
  }
  if (pending.length) {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") last.content = `${last.content}\n\n${pending.join("\n\n")}`;
    else if (messages.length) messages.push({ role: "assistant", content: pending.join("\n\n") });
  }
  return messages;
}

/** Yeni sohbetin başlığı: öğrencinin ilk cümlesinden (yoksa yedek ad). */
export const VOICE_CONVERSATION_FALLBACK_TITLE = "Sesli ders";

export function conversationTitleFrom(messages: readonly SavedTurn[]): string {
  const first = messages.find((message) => message.role === "user")?.content ?? "";
  const sentence = first.split(/(?<=[.!?…])\s/)[0]?.trim() ?? "";
  const title = sentence.replace(/\s+/g, " ").slice(0, 60).trim();
  return title || VOICE_CONVERSATION_FALLBACK_TITLE;
}
