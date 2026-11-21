import type { BoardCard } from "@/lib/tutor/realtime/config";
import type { TranscriptUpdate } from "@/lib/tutor/realtime/engine";
import { composeSavedTurns, type SavedTurn } from "@/lib/tutor/realtime/transcript";

/*
  Sohbetin içindeki canlı sesli ders (öğretmen v3, 21 Kasım 2026). Ses çubuğu söylenenleri ve tahta kartlarını sırayla
  verir; sohbet onları akışa düşürür. Oturum bitince aynı satırlar, sunucunun sohbete kaydettiği biçimle (aynı birleştirici:
  `composeSavedTurns`) sohbetin mesajlarına dönüşür; sayfayı yenilemeye gerek kalmaz. Saf; ağ ve React yok.
*/

export type LiveEntry = { kind: "turn"; turn: TranscriptUpdate } | { kind: "card"; card: BoardCard };

/** Satır güncellemesi: aynı kimlik büyür; boş metinle kesinleşen satır (söz yazıya dökülemedi) akıştan kalkar. */
export function applyTranscriptUpdate(entries: readonly LiveEntry[], turn: TranscriptUpdate): LiveEntry[] {
  const index = entries.findIndex((entry) => entry.kind === "turn" && entry.turn.id === turn.id);
  if (turn.final && !turn.text.trim()) return index >= 0 ? entries.filter((_, i) => i !== index) : entries.slice();
  if (index >= 0) {
    const next = entries.slice();
    next[index] = { kind: "turn", turn };
    return next;
  }
  return [...entries, { kind: "turn", turn }];
}

/** Kart, aynı kimlik ikinci kez gelirse eklenmez. */
export function appendBoardCard(entries: readonly LiveEntry[], card: BoardCard): LiveEntry[] {
  if (entries.some((entry) => entry.kind === "card" && entry.card.id === card.id)) return entries.slice();
  return [...entries, { kind: "card", card }];
}

/** Akıştaki satırlar ve kartlar → sohbete kaydedilen mesajlar (sunucunun kaydıyla aynı birleştirme). */
export function liveEntriesToMessages(entries: readonly LiveEntry[]): SavedTurn[] {
  const turns: { role: "user" | "assistant"; text: string }[] = [];
  const cards: { kind: BoardCard["kind"]; title: string; body: string; afterTurn: number | null }[] = [];
  for (const entry of entries) {
    if (entry.kind === "turn") turns.push({ role: entry.turn.role, text: entry.turn.text });
    else cards.push({ kind: entry.card.kind, title: entry.card.title, body: entry.card.body, afterTurn: turns.length ? turns.length - 1 : null });
  }
  return composeSavedTurns(turns, cards);
}
