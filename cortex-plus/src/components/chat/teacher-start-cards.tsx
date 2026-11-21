"use client";

import { useEffect, useRef, useState } from "react";
import type { TutorStartCard } from "@/lib/tutor/student-context";
import "@/styles/teacher-v2-sohbet.css";

/** Ekranda en çok dört kart (sunucunun sınırıyla aynı). */
export const START_CARD_LIMIT = 4;

const KINDS = new Set(["weak", "exam", "photo", "analogy"]);

function validCards(body: unknown): TutorStartCard[] {
  const cards = (body as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(
      (card): card is TutorStartCard =>
        Boolean(card) &&
        typeof card.id === "string" &&
        KINDS.has(card.kind) &&
        typeof card.label === "string" &&
        card.label.trim().length > 0 &&
        typeof card.prompt === "string",
    )
    .slice(0, START_CARD_LIMIT);
}

/**
 * Karşılama kartları (Faz 11, teacher.v2, ana sohbet): öğretmen ilk sözü söyledikten sonra, konuşma henüz boşken,
 * öğrencinin kendi kayıtlarından en çok dört başlangıç (`GET /api/teacher/start-cards`; modelsiz, kota yok). Uç bir
 * kez istenir; 404 (bayrak kapalı), hata ya da boş liste → hiçbir şey çizilmez.
 */
export function TeacherStartCards({ onChoose }: { onChoose: (card: TutorStartCard) => void }) {
  const [cards, setCards] = useState<TutorStartCard[]>([]);
  // Tek istek: etki iki kez koşsa da (geliştirmede React'in sıkı kipi) aynı istek paylaşılır.
  const request = useRef<Promise<TutorStartCard[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    request.current ??= fetch("/api/teacher/start-cards", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(validCards)
      .catch(() => []);
    void request.current.then((next) => {
      if (!cancelled) setCards(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cards.length) return null;
  return (
    <div className="cx-v2-starts" role="group" aria-label="Başlangıç önerileri">
      {cards.map((card) => (
        <button key={card.id} type="button" className="cx-v2-start" data-kind={card.kind} onClick={() => onChoose(card)}>
          <span className="cx-v2-start-emoji" aria-hidden>
            {card.emoji}
          </span>
          <span className="cx-v2-start-label">{card.label}</span>
        </button>
      ))}
    </div>
  );
}
