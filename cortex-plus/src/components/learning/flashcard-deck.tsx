"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Card = { id: string; front: string; back: string };

type Grade = "hard" | "good" | "easy";

const GRADE_LABEL: Record<Grade, string> = {
  hard: "Zorlandım",
  good: "Hatırladım",
  easy: "Çok Kolaydı",
};

/**
 * Kütüphanedeki hazır deste.
 *
 * Kartı çevir, sonra SM-2 ile aynı üç yargı: zorlandım, hatırladım, çok kolaydı.
 * Oturum sayacı yeter; kartların defteri yanlışlar defteri değil.
 */
export function FlashcardDeck({ title, cards }: { title: string; cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<Record<Grade, number>>({ hard: 0, good: 0, easy: 0 });
  const [finished, setFinished] = useState(false);

  const count = cards.length;
  const safeIndex = count ? Math.min(index, count - 1) : 0;
  const card = count ? cards[safeIndex] : null;

  const restart = useCallback(() => {
    setIndex(0);
    setRevealed(false);
    setCounts({ hard: 0, good: 0, easy: 0 });
    setFinished(false);
  }, []);

  const mark = useCallback(
    (grade: Grade) => {
      if (!count || finished || !revealed) return;
      setCounts((current) => ({ ...current, [grade]: current[grade] + 1 }));
      if (safeIndex + 1 >= count) {
        setFinished(true);
        return;
      }
      setRevealed(false);
      setIndex(safeIndex + 1);
    },
    [count, finished, revealed, safeIndex],
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
      if (event.key === "ArrowLeft" || event.key === "1") mark("hard");
      if (event.key === "ArrowRight" || event.key === "2") mark("good");
      if (event.key === "ArrowUp" || event.key === "3") mark("easy");
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
          Zorlandım: {counts.hard} · Hatırladım: {counts.good} · Çok Kolaydı: {counts.easy}
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

      <div className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
        {(Object.keys(GRADE_LABEL) as Grade[]).map((grade) => (
          <Button
            key={grade}
            type="button"
            variant={grade === "good" ? "default" : "outline"}
            size="sm"
            disabled={!revealed}
            onClick={() => mark(grade)}
            className={cn(
              "min-h-11 w-full",
              grade === "good"
                ? ""
                : "border-[var(--cs-border)] bg-transparent text-[var(--cs-text)] hover:bg-white/5",
            )}
          >
            {GRADE_LABEL[grade]}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-[var(--cs-muted)]">
        Önce çevir. Klavye: boşluk çevirir · 1 zorlandım · 2 hatırladım · 3 çok kolaydı
      </p>
    </section>
  );
}

export type FlashcardDeckSummary = { id: string; title: string; cards: Card[] };

/** Desteler alt alta açılmaz; biri seçilince o deste çalışılır. */
export function FlashcardLibrary({ decks }: { decks: FlashcardDeckSummary[] }) {
  const [openId, setOpenId] = useState<string | null>(decks.length === 1 ? decks[0]?.id ?? null : null);
  const open = decks.find((deck) => deck.id === openId) ?? null;
  if (open) {
    return (
      <div className="space-y-3">
        {decks.length > 1 ? (
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-[var(--cs-muted)]"
            onClick={() => setOpenId(null)}
          >
            ← Destelere dön
          </button>
        ) : null}
        <FlashcardDeck title={open.title} cards={open.cards} />
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
      {decks.map((deck) => (
        <li key={deck.id} className="min-w-0">
          <button
            type="button"
            className="flex min-h-16 w-full min-w-0 flex-col items-start gap-1 rounded-2xl border border-[var(--cs-border)] bg-[var(--cs-surface,transparent)] p-4 text-left"
            onClick={() => setOpenId(deck.id)}
          >
            <span className="w-full truncate font-semibold text-[var(--cs-text)]">{deck.title}</span>
            <span className="text-sm text-[var(--cs-muted)]">{deck.cards.length} kart</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
