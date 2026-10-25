"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { warmupCards, warmupReflex, warmupTips } from "@/lib/learning/generation-warmup";

/**
 * Üretim beklerken açılır zihin ısıtma. Model çağırmaz; konu adından kart, ipucu ve
 * mini refleks üretir. Öğrenci sıkılmasın, kredi düşmesin.
 */
export function GenerationWarmup({ topic = "" }: { topic?: string }) {
  const cards = useMemo(() => warmupCards(topic), [topic]);
  const tips = useMemo(() => warmupTips(topic), [topic]);
  const reflex = useMemo(() => warmupReflex(topic), [topic]);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"cards" | "tips" | "reflex">("cards");
  const [cardAt, setCardAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tipAt, setTipAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const card = cards[Math.min(cardAt, cards.length - 1)]!;
  const tip = tips[Math.min(tipAt, tips.length - 1)]!;

  return (
    <section className="apg-warmup" aria-label="Hazırlanırken hızlı zihin ısıtma">
      <button
        type="button"
        className="apg-warmup-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Zap className="h-4 w-4" aria-hidden />
        Hazırlanırken Hızlı Zihin Isıtma
      </button>
      {open ? (
        <div className="apg-warmup-panel">
          <p className="apg-warmup-kicker">Hazırlanırken zihnini aç</p>
          <div className="apg-warmup-tabs" role="tablist">
            {(
              [
                ["cards", "Bil-geç"],
                ["tips", "Sınav ipucu"],
                ["reflex", "Refleks"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "is-on" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "cards" ? (
            <div className="apg-warmup-card">
              <button type="button" className="apg-warmup-flip" onClick={() => setFlipped((value) => !value)}>
                <span className="apg-warmup-face">{flipped ? card.back : card.front}</span>
                <span className="apg-warmup-hint">{flipped ? "Soruya dön" : "Çevir"}</span>
              </button>
              <div className="apg-warmup-nav">
                <button
                  type="button"
                  aria-label="Önceki kart"
                  disabled={cardAt === 0}
                  onClick={() => {
                    setCardAt((value) => Math.max(0, value - 1));
                    setFlipped(false);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>
                  {cardAt + 1} / {cards.length}
                </span>
                <button
                  type="button"
                  aria-label="Sonraki kart"
                  disabled={cardAt >= cards.length - 1}
                  onClick={() => {
                    setCardAt((value) => Math.min(cards.length - 1, value + 1));
                    setFlipped(false);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {tab === "tips" ? (
            <div className="apg-warmup-tip">
              <p className="apg-warmup-tip-title">{tip.title}</p>
              <p>{tip.body}</p>
              <div className="apg-warmup-nav">
                <button
                  type="button"
                  aria-label="Önceki ipucu"
                  disabled={tipAt === 0}
                  onClick={() => setTipAt((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>
                  {tipAt + 1} / {tips.length}
                </span>
                <button
                  type="button"
                  aria-label="Sonraki ipucu"
                  disabled={tipAt >= tips.length - 1}
                  onClick={() => setTipAt((value) => Math.min(tips.length - 1, value + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {tab === "reflex" ? (
            <div className="apg-warmup-reflex">
              <p className="apg-warmup-tip-title">{reflex.prompt}</p>
              <div className="apg-warmup-options">
                {reflex.options.map((option, index) => {
                  const state =
                    picked == null ? undefined : index === reflex.answerIndex ? "is-right" : picked === index ? "is-wrong" : undefined;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={state}
                      disabled={picked != null}
                      onClick={() => setPicked(index)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {picked != null ? <p className="apg-warmup-why">{reflex.why}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
