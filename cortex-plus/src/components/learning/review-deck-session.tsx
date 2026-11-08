"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import { Markdown } from "@/components/markdown";
import type { GeneralReviewCard } from "@/lib/learning/general-review";
import "@/styles/review-deck.css";

/**
 * Tekrar destesi oturumu (8 Kasım 2026). Bir seferde bir kart: önce boşluklu cümle, "Cevabı göster" ile kilit
 * bilgi, sonra öğrenci kendini değerlendirir. Yanıt sunucuya gider (basamak ve gün orada hesaplanır); bağlantı
 * düşerse kart yine geçer, öğrenci bekletilmez ve sonda kaç kartın kaydedilemediği söylenir.
 */
export function ReviewDeckSession({
  cards,
  dueCount,
  total,
}: {
  cards: GeneralReviewCard[];
  dueCount: number;
  total: number;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knewCount, setKnewCount] = useState(0);
  const [failedSaves, setFailedSaves] = useState(0);
  const card = cards[index];

  async function answer(knew: boolean) {
    if (!card) return;
    if (knew) setKnewCount((count) => count + 1);
    setRevealed(false);
    setIndex((value) => value + 1);
    try {
      const res = await fetch("/api/review/deck", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, knew }),
      });
      if (!res.ok) setFailedSaves((count) => count + 1);
    } catch {
      setFailedSaves((count) => count + 1);
    }
  }

  if (!cards.length) {
    return (
      <main className="rd">
        <div className="rd-empty">
          <Icon3D name="tekrar" size={88} />
          <h1>{total ? "Bugünkü tekrarın bitti" : "Tekrar destem"}</h1>
          <p>
            {total
              ? `Destende ${total} kart var; sıradaki tekrar günü gelince burada.`
              : "Öğretmenle konuşurken cevabın altındaki “Akılda kalsın” kartında “Tekrarıma ekle”ye bas; o bilgiler 1, 3, 7 ve 14 gün sonra burada sorulur."}
          </p>
          <Link href="/ogretmen" className="rd-primary">
            Öğretmene dön
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="rd">
        <div className="rd-empty">
          <Icon3D name="yildiz" size={88} />
          <h1>Bu tur bitti</h1>
          <p>
            {cards.length} karttan {knewCount} tanesini bildin.
            {dueCount > cards.length ? ` ${dueCount - cards.length} kart daha bekliyor.` : ""}
          </p>
          {failedSaves ? (
            <p className="rd-warn" role="alert">
              {failedSaves} kartın yanıtı kaydedilemedi; o kartlar yarın yeniden sorulur.
            </p>
          ) : null}
          <div className="rd-actions">
            {dueCount > cards.length ? (
              <button type="button" className="rd-primary" onClick={() => window.location.reload()}>
                <RotateCcw size={16} aria-hidden />
                Devam et
              </button>
            ) : null}
            <Link href="/ogretmen" className={dueCount > cards.length ? "rd-secondary" : "rd-primary"}>
              Öğretmene dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="rd">
      <header className="rd-head">
        <p className="rd-kicker">Tekrar destem</p>
        <p className="rd-count" aria-label={`${cards.length} karttan ${index + 1}.`}>
          {index + 1} / {cards.length}
        </p>
      </header>
      <div className="rd-progress" aria-hidden>
        <span style={{ width: `${(index / cards.length) * 100}%` }} />
      </div>

      <section className="rd-card" aria-live="polite">
        <p className="rd-prompt-label">Boşluğa ne gelir?</p>
        <div className="rd-front">
          <Markdown content={card.front} variant="parity" />
        </div>
        {revealed ? (
          <div className="rd-back">
            <p className="rd-back-label">Cevap</p>
            <p className="rd-back-text">{card.back}</p>
          </div>
        ) : null}
      </section>

      {revealed ? (
        <div className="rd-grade" role="group" aria-label="Kendini değerlendir">
          <button type="button" className="rd-grade-btn rd-grade-btn--miss" onClick={() => void answer(false)}>
            <X size={18} aria-hidden />
            Bilemedim
          </button>
          <button type="button" className="rd-grade-btn rd-grade-btn--hit" onClick={() => void answer(true)}>
            <Check size={18} aria-hidden />
            Bildim
          </button>
        </div>
      ) : (
        <button type="button" className="rd-primary rd-reveal" onClick={() => setRevealed(true)}>
          Cevabı göster
        </button>
      )}
    </main>
  );
}
