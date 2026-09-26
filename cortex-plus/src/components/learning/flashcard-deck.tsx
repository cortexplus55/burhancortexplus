"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Card = { id: string; front: string; back: string };

/**
 * Kütüphanedeki hazır deste.
 *
 * Stüdyoyla aynı oturum kuralı: kartı çevir, "Biliyorum" ya da "Tekrar et"
 * de; deste bitince öğrenilen / tekrar edilecek sayısı. Aralıklı tekrar yok —
 * oturum sayacı yeter, kartların defteri yanlışlar defteri değil.
 */
export function FlashcardDeck({ title, cards }: { title: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);
  const [again, setAgain] = useState(0);
  const [finished, setFinished] = useState(false);

  const count = cards.length;
  const safeIndex = count ? Math.min(index, count - 1) : 0;
  const card = count ? cards[safeIndex] : null;

  const restart = useCallback(() => {
    setIndex(0);
    setRevealed(false);
    setKnown(0);
    setAgain(0);
    setFinished(false);
  }, []);

  const mark = useCallback(
    (knew: boolean) => {
      if (!count || finished) return;
      if (knew) setKnown((n) => n + 1);
      else setAgain((n) => n + 1);
      if (safeIndex + 1 >= count) {
        setFinished(true);
        return;
      }
      setRevealed(false);
      setIndex(safeIndex + 1);
    },
    [count, finished, safeIndex],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!count || finished) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setRevealed((prev) => !prev);
      }
      if (event.key === "ArrowLeft") mark(false);
      if (event.key === "ArrowRight") mark(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, finished, mark]);

  if (!card) return null;

  if (finished) {
    return (
      <section className="cs-pay-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-[var(--cs-text)]">{title}</h3>
          <span className="text-xs text-[var(--cs-muted)]">
            {count} / {count}
          </span>
        </div>
        <p className="mt-3 text-sm text-[var(--cs-text)]" role="status">
          Deste kapandı.
        </p>
        <p className="mt-1 text-sm text-[var(--cs-muted)]">
          Öğrenildi: {known} · Tekrar edilecek: {again}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={restart}
            className="cs-btn-primary h-9 rounded-full px-5 text-sm font-semibold"
          >
            Bir tur daha
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cs-pay-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-semibold text-[var(--cs-text)]">{title}</h3>
        <span className="shrink-0 text-xs text-[var(--cs-muted)]">
          {safeIndex + 1} / {count}
        </span>
      </div>

      <div className="mt-3 flex justify-center gap-1" aria-hidden>
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i === safeIndex ? "w-4 bg-amber-400" : i < safeIndex ? "w-1.5 bg-amber-400/40" : "w-1.5 bg-white/15",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-expanded={revealed}
        aria-label={revealed ? "Kartı soruya çevir" : "Kartı cevaba çevir"}
        className="cs-flashcard-scene mt-3 w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cs-primary)]"
      >
        <div
          className={cn(
            "cs-flashcard-inner",
            revealed && "cs-flashcard-inner--revealed",
          )}
        >
          <div className="cs-flashcard-face cs-flashcard-face--front">
            <span className="block text-xs font-medium uppercase tracking-wide text-[var(--cs-muted)]">
              Soru
            </span>
            <span className="mt-2 block break-words text-sm font-medium text-[var(--cs-text)] [overflow-wrap:anywhere]">
              {card.front}
            </span>
            <span className="mt-3 block text-xs text-[var(--cs-muted)]">
              Cevabı görmek için dokun
            </span>
          </div>
          <div className="cs-flashcard-face cs-flashcard-face--back">
            <span className="block text-xs font-medium uppercase tracking-wide text-[var(--cs-muted)]">
              Cevap
            </span>
            <span className="mt-2 block break-words text-sm text-[var(--cs-text)] [overflow-wrap:anywhere]">
              {card.back}
            </span>
          </div>
        </div>
      </button>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => mark(false)}
          className="flex-1 border-[var(--cs-border)] bg-transparent text-[var(--cs-text)] hover:bg-white/5"
        >
          Tekrar et
        </Button>
        <button
          type="button"
          onClick={() => mark(true)}
          className="cs-btn-primary h-9 flex-1 rounded-full px-5 text-sm font-semibold"
        >
          Biliyorum
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-[var(--cs-muted)]">
        Klavye: boşluk çevirir · ← tekrar et · → biliyorum
      </p>
    </section>
  );
}
