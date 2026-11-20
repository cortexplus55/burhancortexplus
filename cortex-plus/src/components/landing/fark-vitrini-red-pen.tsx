"use client";

import { useEffect, useRef, useState } from "react";
import { ShowcaseChips, ShowcaseCompareBlock, ShowcaseHead } from "@/components/landing/fark-vitrini-parts";
import { RED_PEN_SHOWCASE } from "@/lib/marketing/fark-vitrini";
import { startMoment, type MomentHandle } from "@/lib/ui/moment";
import { cn } from "@/lib/utils";
import "@/styles/fark-vitrini.css";

/**
 * Kart B — Kırmızı Kalemli Hoca önizlemesi (20 Kasım 2026, Faz 7).
 *
 * Örnek bir çözüm kâğıdı: öğrencinin satırları el yazısı havasında (yazı tipi yüklenmez; eğik yazı ve hafif açı),
 * kazandıran satırlar yeşil tikle, puan kırılan satır kırmızı kalemle. İki görünüm: "Öğrencinin kâğıdı" (işaretsiz) ve
 * "Kırmızı kalemle" (açılışta bu; sunucu çiziminde de rozetler görünür). Kırmızı kaleme dönünce işaretler bir "an"
 * olarak çizilir (`startMoment`: en çok 2,5 sn, dokununca atlanır, hareket azaltmada hemen biter). İstek ve model yok.
 */

const DRAW_MS = 1500;

type View = "marked" | "plain";

/** El çizimi halka: kapanmayan, ucu taşan bir elips (kırmızı kalem). */
function PenCircle({ className }: { className?: string }) {
  return (
    <svg className={cn("fv-pen-ring", className)} viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden>
      <path
        pathLength={1}
        d="M28 10 C70 1 150 2 186 14 C202 20 196 44 160 52 C118 60 46 58 16 46 C-4 38 6 16 40 9 C62 5 84 5 102 6"
      />
    </svg>
  );
}

/** El çizimi tik. */
function PenTick() {
  return (
    <svg className="fv-pen-tick" viewBox="0 0 24 24" aria-hidden>
      <path pathLength={1} d="M3 13.5 C5.5 15 7.5 17.5 9 20 C12 13 16 7.5 21.5 3.5" />
    </svg>
  );
}

/** Yanlış satırın altına inen dalgalı çizgi. */
function PenSquiggle() {
  return (
    <svg className="fv-pen-squiggle" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden>
      <path pathLength={1} d="M2 6 C10 1 16 9 24 5 C32 1 38 9 46 5 C54 1 60 9 68 5 C76 1 82 9 90 5 C98 1 104 9 118 4" />
    </svg>
  );
}

/**
 * `compact` (Faz 9, 20 Kasım 2026): ana sayfadaki akordeonun sahnesi; başlık ve fark satırı akordeonda, kart yalnız
 * "Plus" etiketini, görünüm seçicisini ve kâğıdı çizer. /ornek'teki şerit tam kartı kullanır.
 */
export function RedPenShowcaseCard({ compact = false }: { compact?: boolean }) {
  const data = RED_PEN_SHOWCASE;
  const [view, setView] = useState<View>("marked");
  const [drawing, setDrawing] = useState(false);
  const moment = useRef<MomentHandle | null>(null);

  useEffect(() => () => moment.current?.end(), []);

  function show(next: View) {
    if (next === view) return;
    moment.current?.end();
    setView(next);
    if (next !== "marked") return;
    setDrawing(true);
    moment.current = startMoment(DRAW_MS, () => setDrawing(false));
  }

  const marked = view === "marked";
  const earned: readonly number[] = data.earned.lines;
  const lastEarned = Math.max(...earned);
  const titleId = `${data.id}-title`;

  return (
    <article
      className="fv-card fv-card--pen"
      aria-labelledby={compact ? undefined : titleId}
      aria-label={compact ? data.paperLabel : undefined}
      data-testid="showcase-red-pen"
      data-view={view}
    >
      {compact ? <ShowcaseChips plus /> : <ShowcaseHead id={titleId} title={data.title} plus />}

      <div className="fv-stage">
        <div className="fv-seg" role="group" aria-label={data.views.label}>
          {(["plain", "marked"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={cn("fv-seg-btn", view === option && "is-on")}
              aria-pressed={view === option}
              onClick={() => show(option)}
            >
              {data.views[option]}
            </button>
          ))}
        </div>

        <figure className="fv-paper" data-drawing={drawing ? "" : undefined}>
          <figcaption className="fv-paper-head">
            <span className="fv-paper-label">{data.paperLabel}</span>
            <span className="fv-paper-q">{data.question}</span>
          </figcaption>
          <ol className="fv-paper-lines">
            {data.lines.map((line, at) => {
              const good = marked && earned.includes(at);
              const bad = marked && data.lost.line === at;
              return (
                <li key={line} className={cn("fv-paper-line", good && "is-good", bad && "is-bad")}>
                  <span className="fv-paper-row">
                    <span className="fv-ink">
                      {line}
                      {bad ? <PenSquiggle /> : null}
                    </span>
                    {good ? <PenTick /> : null}
                  </span>
                  {/* Rozet ilgili satırın hemen altında: kazandıranlar son doğru satırda, kırılan puan kendi satırında. */}
                  {good && at === lastEarned ? (
                    <span className="fv-mark fv-mark--good" data-testid="red-pen-earned">
                      {data.earned.badge}
                    </span>
                  ) : null}
                  {bad ? (
                    <span className="fv-mark fv-mark--bad" data-testid="red-pen-lost">
                      <PenCircle />
                      <span className="fv-mark-text">{data.lost.badge}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {marked ? <p className="fv-paper-total">{data.total}</p> : null}
        </figure>
      </div>

      <p className="fv-note">{data.note}</p>
      {compact ? null : <ShowcaseCompareBlock compare={data.compare} />}
    </article>
  );
}
