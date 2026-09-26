/**
 * Oturum kuyruğu: vadesi geçmiş → yanlışlardan → yeni (max 10 yeni).
 * Oturum en fazla 20 kart.
 */

import type { SessionFlashcard } from "@/lib/learning/flashcard-model";

export const SESSION_MAX_CARDS = 20;
export const SESSION_NEW_CARD_LIMIT = 10;
/** ~20 sn / kart → 8 dk ≈ 24; tavan SESSION_MAX_CARDS. */
export const SESSION_TARGET_MINUTES = 8;

export type QueueBucket = "due" | "mistake" | "new";

export type QueuedCard = SessionFlashcard & {
  bucket: QueueBucket;
  dueAt?: string | null;
};

export type SessionQueueSummary = {
  dueCount: number;
  mistakeCount: number;
  newCount: number;
  estimatedMinutes: number;
  cards: QueuedCard[];
};

function sortDueOldestFirst(a: QueuedCard, b: QueuedCard): number {
  const ta = a.dueAt ? Date.parse(a.dueAt) : 0;
  const tb = b.dueAt ? Date.parse(b.dueAt) : 0;
  return ta - tb;
}

/**
 * Bilmedim kartını aynı oturumda `after` kart sonra yeniden ekler.
 */
export function requeueMissedInSession(
  remaining: QueuedCard[],
  card: QueuedCard,
  after = 3,
): QueuedCard[] {
  const copy = [...remaining];
  const at = Math.min(after, copy.length);
  copy.splice(at, 0, { ...card, bucket: "due" });
  return copy;
}

export function buildSessionQueue(input: {
  due: QueuedCard[];
  mistakes: QueuedCard[];
  fresh: QueuedCard[];
  maxCards?: number;
  newLimit?: number;
}): SessionQueueSummary {
  const maxCards = input.maxCards ?? SESSION_MAX_CARDS;
  const newLimit = input.newLimit ?? SESSION_NEW_CARD_LIMIT;

  const due = [...input.due].sort(sortDueOldestFirst);
  const mistakes = [...input.mistakes];
  const fresh = input.fresh.slice(0, newLimit);

  const cards: QueuedCard[] = [];
  for (const card of due) {
    if (cards.length >= maxCards) break;
    cards.push({ ...card, bucket: "due" });
  }
  for (const card of mistakes) {
    if (cards.length >= maxCards) break;
    // Aynı cardKey zaten kuyruktaysa atla.
    if (cards.some((c) => c.cardKey === card.cardKey)) continue;
    cards.push({ ...card, bucket: "mistake" });
  }
  for (const card of fresh) {
    if (cards.length >= maxCards) break;
    if (cards.some((c) => c.cardKey === card.cardKey)) continue;
    cards.push({ ...card, bucket: "new" });
  }

  const dueCount = cards.filter((c) => c.bucket === "due").length;
  const mistakeCount = cards.filter((c) => c.bucket === "mistake").length;
  const newCount = cards.filter((c) => c.bucket === "new").length;
  const estimatedMinutes = Math.max(1, Math.ceil((cards.length * 20) / 60));

  return { dueCount, mistakeCount, newCount, estimatedMinutes, cards };
}

/** Sınava ≤2 gün: hiç görülmemiş + Bilmedim kartlarını öne al. */
export function prioritizeUrgent(
  cards: QueuedCard[],
  opts: { daysLeft: number; neverSeenKeys: Set<string>; missedKeys: Set<string> },
): QueuedCard[] {
  if (opts.daysLeft > 2) return cards;
  const urgent: QueuedCard[] = [];
  const rest: QueuedCard[] = [];
  for (const card of cards) {
    if (opts.neverSeenKeys.has(card.cardKey) || opts.missedKeys.has(card.cardKey)) {
      urgent.push(card);
    } else {
      rest.push(card);
    }
  }
  return [...urgent, ...rest];
}
