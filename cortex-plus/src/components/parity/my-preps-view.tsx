"use client";

import Link from "next/link";
import { useState } from "react";
import { PrepCard, type ExamPrepCard } from "@/components/parity/exam-prep";

/**
 * "Sınav hazırlıklarım" — Astra'daki ayrı sayfa (1 Ekim 2026): bütün
 * hazırlıklar, Yaklaşan / Geçmiş. Ana liste yalnız son birkaçını gösteriyor.
 */
export function MyPrepsView({ cards, userInitial }: { cards: ExamPrepCard[]; userInitial: string }) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const upcoming = cards.filter((card) => !card.past);
  const past = cards.filter((card) => card.past);
  const shown = tab === "upcoming" ? upcoming : past;
  const joins = cards.reduce((sum, card) => sum + (card.joinCount ?? 0), 0);

  return (
    <div className="cp-exam-page cp-my-preps">
      <header className="cp-my-preps-head">
        <span className="cp-my-preps-avatar" aria-hidden>
          {userInitial}
        </span>
        <h1>Sınav hazırlıklarım</h1>
        <p>
          {cards.length} hazırlık
          {joins > 0 ? ` · ${joins} katılım` : ""}
        </p>
      </header>

      <div className="cp-my-preps-tabs" role="tablist" aria-label="Hazırlıklar">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "upcoming"}
          className={tab === "upcoming" ? "is-on" : undefined}
          onClick={() => setTab("upcoming")}
        >
          Yaklaşan ({upcoming.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "past"}
          className={tab === "past" ? "is-on" : undefined}
          onClick={() => setTab("past")}
        >
          Geçmiş ({past.length})
        </button>
      </div>

      {shown.length ? (
        <div className="cp-my-preps-grid">
          {shown.map((card, index) => (
            <PrepCard key={card.id} card={card} showTargetLabel={index === 0} />
          ))}
        </div>
      ) : (
        <p className="cp-upload-hint">
          {tab === "upcoming"
            ? "Yaklaşan sınavın yok. Yeni bir hazırlık kurabilirsin."
            : "Sınav günü geçmiş bir hazırlığın yok."}
        </p>
      )}

      <Link href="/deneme-sinavlari/olustur" className="cp-exam-create cp-my-preps-new">
        + Yeni hazırlık
      </Link>
    </div>
  );
}
