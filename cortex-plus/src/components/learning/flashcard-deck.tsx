"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Card = { id: string; front: string; back: string };

export function FlashcardDeck({ title, cards }: { title: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const count = cards.length;
  const safeIndex = count ? Math.min(index, count - 1) : 0;
  const card = count ? cards[safeIndex] : null;

  const move = useCallback(
    (step: number) => {
      if (!count) return;
      setRevealed(false);
      setIndex((prev) => (prev + step + count) % count);
    },
    [count],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!count) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setRevealed((prev) => !prev);
      }
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, move]);

  if (!card) return null;

  return (
    <section className="astra-pay-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--astra-text)]">{title}</h3>
        <span className="text-xs text-[var(--astra-muted)]">
          {safeIndex + 1} / {count}
        </span>
      </div>

      <div className="mt-3 flex justify-center gap-1" aria-hidden>
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i === safeIndex ? "w-4 bg-amber-400" : "w-1.5 bg-white/15",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-expanded={revealed}
        className="astra-flashcard-scene mt-3 w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--astra-primary)]"
      >
        <div
          className={cn(
            "astra-flashcard-inner",
            revealed && "astra-flashcard-inner--revealed",
          )}
        >
          <div className="astra-flashcard-face astra-flashcard-face--front">
            <span className="block text-xs font-medium uppercase tracking-wide text-[var(--astra-muted)]">
              Soru
            </span>
            <span className="mt-2 block text-sm font-medium text-[var(--astra-text)]">
              {card.front}
            </span>
            <span className="mt-3 block text-xs text-[var(--astra-muted)]">
              Cevabı görmek için dokun
            </span>
          </div>
          <div className="astra-flashcard-face astra-flashcard-face--back">
            <span className="block text-xs font-medium uppercase tracking-wide text-[var(--astra-muted)]">
              Cevap
            </span>
            <span className="mt-2 block text-sm text-[var(--astra-text)]">{card.back}</span>
          </div>
        </div>
      </button>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => move(-1)}
          className="border-[var(--astra-border)] bg-transparent text-[var(--astra-text)] hover:bg-white/5"
        >
          Önceki
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => move(1)}
          className="border-[var(--astra-border)] bg-transparent text-[var(--astra-text)] hover:bg-white/5"
        >
          Sonraki
        </Button>
      </div>
    </section>
  );
}
