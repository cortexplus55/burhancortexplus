"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RichBody } from "@/components/parity/lesson-rich-text";
import type { LessonCarousel, LessonHook, LessonTrap } from "@/lib/learning/lesson-v3";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/**
 * Bağıntı gövdeye gömülmez, ayrı bir kart olarak durur — Astra
 * karşılaştırmasında gövdeye sıkışan formüllerin gövdeyi hem uzatıp hem
 * okunaksızlaştırdığı görüldü. `.als-formula` adı `RichBody`'nin satır içi
 * matematik bloğu tarafından zaten kullanılıyor; çakışmasın diye bu kart
 * `.als-formula-card`.
 */
export function FormulaCard({ formula }: { formula: NonNullable<LessonV2["sections"][number]["formula"]> }) {
  const symbols = "symbols" in formula && Array.isArray(formula.symbols) ? formula.symbols : [];
  return (
    <div className="als-formula-card" role="group" aria-label="Formül ve kural">
      <p className="als-kicker als-kicker--formula">Formül & Kural</p>
      <p className="als-formula-card-title">{formula.title}</p>
      <p className="als-formula-card-expr">
        <RichBody text={formula.expression} />
      </p>
      {symbols.length ? (
        <ul className="als-formula-symbols">
          {symbols.map((item) => (
            <li key={`${item.symbol}-${item.meaning}`}>
              <span>{item.symbol}</span>
              {item.meaning}
            </li>
          ))}
        </ul>
      ) : formula.note ? (
        <p className="als-formula-card-note">{formula.note}</p>
      ) : null}
    </div>
  );
}

/** Sınav tuzağı: kırmızı-turuncu kenar, yanlış inanç etiketli. */
export function ExamTrapCard({ trap, topicHint }: { trap: LessonTrap; topicHint: string }) {
  return (
    <aside className="als-visual als-visual--trap" aria-label="Sınav tuzağı">
      <p className="als-kicker als-kicker--trap">Sınav tuzağı</p>
      <p className="als-visual-title">{trap.title}</p>
      <p className="als-visual-wrong">
        <span className="als-tag als-tag--warn">Sakın</span>
        <RichBody text={trap.wrong} topicHint={topicHint} />
      </p>
      <p className="als-visual-right">
        <span className="als-tag als-tag--ok">Doğrusu</span>
        <RichBody text={trap.right} topicHint={topicHint} />
      </p>
      {trap.tell ? (
        <p className="als-visual-tell">
          <span className="als-tag">Ayırt et</span>
          <RichBody text={trap.tell} topicHint={topicHint} />
        </p>
      ) : null}
    </aside>
  );
}

/** Hafıza çivisi: mor kenar, 5 saniyelik kodlama. */
export function MemoryHookCard({ hook, topicHint }: { hook: LessonHook; topicHint: string }) {
  const kindLabel = hook.kind === "shortcut" ? "Kısa yol" : hook.kind === "image" ? "Zihin resmi" : "Benzetme";
  return (
    <aside className="als-visual als-visual--hook" aria-label="Hafıza çivisi">
      <p className="als-kicker als-kicker--hook">Hafıza çivisi · {kindLabel}</p>
      <p className="als-visual-title">{hook.title}</p>
      <p className="als-visual-body">
        <RichBody text={hook.body} topicHint={topicHint} />
      </p>
    </aside>
  );
}

/** Kaydırılabilir karşılaştırma veya adım kartları. */
export function ComparisonCarousel({ carousel, topicHint }: { carousel: LessonCarousel; topicHint: string }) {
  const [at, setAt] = useState(0);
  const slides = carousel.slides;
  const slide = slides[Math.min(at, slides.length - 1)]!;
  const modeLabel = carousel.mode === "steps" ? "Adımlar" : "Karşılaştır";
  return (
    <section className="als-visual als-visual--carousel" aria-label={carousel.title ?? modeLabel}>
      <p className="als-kicker als-kicker--carousel">{modeLabel}</p>
      {carousel.title ? <p className="als-visual-title">{carousel.title}</p> : null}
      <div className="als-carousel-tabs" role="tablist">
        {slides.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === at}
            className={index === at ? "is-on" : undefined}
            onClick={() => setAt(index)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div className="als-carousel-slide">
        <p>
          <RichBody text={slide.body} topicHint={topicHint} />
        </p>
        {slide.points?.length ? (
          <ul className="als-list">
            {slide.points.map((point) => (
              <li key={point}>
                <RichBody text={point} topicHint={topicHint} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="als-carousel-nav">
        <button type="button" aria-label="Önceki kart" disabled={at === 0} onClick={() => setAt((value) => Math.max(0, value - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          {at + 1} / {slides.length}
        </span>
        <button
          type="button"
          aria-label="Sonraki kart"
          disabled={at >= slides.length - 1}
          onClick={() => setAt((value) => Math.min(slides.length - 1, value + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
