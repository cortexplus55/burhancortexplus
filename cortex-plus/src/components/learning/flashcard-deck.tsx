"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Card = { id: string; front: string; back: string };

export function FlashcardDeck({ title, cards }: { title: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (!cards.length) return null;
  const card = cards[Math.min(index, cards.length - 1)];

  function move(step: number) {
    setRevealed(false);
    setIndex((prev) => (prev + step + cards.length) % cards.length);
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {index + 1} / {cards.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-expanded={revealed}
        className="mt-3 min-h-28 w-full rounded-md border bg-accent/40 p-4 text-left text-sm transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="block font-medium">{card.front}</span>
        <span className="mt-2 block text-muted-foreground">
          {revealed ? card.back : "Yanıtı görmek için tıkla veya Enter'a bas"}
        </span>
      </button>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => move(-1)}>
          Önceki
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => move(1)}>
          Sonraki
        </Button>
      </div>
    </section>
  );
}
