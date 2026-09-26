"use client";

import { makeCardKey } from "@/lib/learning/flashcard-model";
import { FlashcardSession } from "@/components/learning/flashcard-session";

type Card = { id: string; front: string; back: string };

/**
 * Kütüphane deste — tek oynatıcıya yönlendirir.
 */
export function FlashcardDeck({ title, cards }: { title: string; cards: Card[] }) {
  if (!cards.length) return null;
  return (
    <FlashcardSession
      title={title}
      grounded
      cards={cards.map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        kind: "definition",
        cardKey: makeCardKey("studio", card.id),
        cardSource: "studio",
      }))}
      newCount={cards.length}
      dueCount={0}
      mistakeCount={0}
    />
  );
}
