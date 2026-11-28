"use client";

import { forwardRef } from "react";
import { ChevronsRight, Moon, NotebookPen, RotateCcw } from "lucide-react";
import type { LiveLook, LiveSpeed } from "@/lib/learning/live-writing";
import type { LivePhase } from "./use-live-writing";

/** Ekrandaki adlar tek yerde. */
export const LIVE_COPY = {
  group: "Canlı defter",
  showAll: "Hepsini göster",
  replay: "Tekrar oynat",
  look: "Görünüm",
  night: "Gece",
  notebook: "Defter",
  speed: (speed: LiveSpeed) => `Yazım hızı ${speed} kat; değiştirmek için dokun`,
} as const;

/**
 * Ders alanının üstündeki kompakt şerit (akışın içinde; "Ders özeti" ve "Son adım" bandıyla aynı satırda değil).
 * Yazılabilir adımda hız ve "Hepsini göster" / "Tekrar oynat"; her adımda Gece / Defter. Bütün düğmeler 44 px.
 */
export function LiveControls({
  phase,
  speed,
  look,
  onSpeed,
  onShowAll,
  onReplay,
  onLook,
}: {
  phase: LivePhase;
  speed: LiveSpeed;
  look: LiveLook;
  onSpeed: (speed: LiveSpeed) => void;
  onShowAll: () => void;
  onReplay: () => void;
  onLook: (look: LiveLook) => void;
}) {
  const typing = phase === "playing" || phase === "done";
  return (
    <div className="lw-controls" role="group" aria-label={LIVE_COPY.group} data-phase={phase}>
      {typing ? (
        <div className="lw-controls-play">
          <button
            type="button"
            className="lw-btn lw-btn--speed"
            aria-label={LIVE_COPY.speed(speed)}
            title={LIVE_COPY.speed(speed)}
            onClick={() => onSpeed(speed === 1 ? 2 : 1)}
          >
            <span aria-hidden>{speed}×</span>
          </button>
          {phase === "playing" ? (
            <button type="button" className="lw-btn lw-btn--show" onClick={onShowAll}>
              <ChevronsRight className="h-4 w-4" aria-hidden />
              {LIVE_COPY.showAll}
            </button>
          ) : (
            <button type="button" className="lw-btn lw-btn--icon" aria-label={LIVE_COPY.replay} title={LIVE_COPY.replay} onClick={onReplay}>
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <span className="lw-controls-spacer" aria-hidden />
      )}
      <div className="lw-look" role="group" aria-label={LIVE_COPY.look}>
        {/* Telefonda yalnız simge; ad ekran okuyucuda kalır (şerit tek satıra sığsın). */}
        <button type="button" className="lw-look-btn" aria-pressed={look === "gece"} title={LIVE_COPY.night} onClick={() => onLook("gece")}>
          <Moon className="h-4 w-4" aria-hidden />
          <span className="lw-look-label">{LIVE_COPY.night}</span>
        </button>
        <button type="button" className="lw-look-btn" aria-pressed={look === "defter"} title={LIVE_COPY.notebook} onClick={() => onLook("defter")}>
          <NotebookPen className="h-4 w-4" aria-hidden />
          <span className="lw-look-label">{LIVE_COPY.notebook}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Kalem ucu: yazılan kelimenin hemen sağında, hafif eğik. Süs; ekran okuyucuya kapalı ve birim sayılmaz
 * (`data-lw-skip`). Konumu motor yazar (`transform`).
 */
export const LivePen = forwardRef<HTMLSpanElement>(function LivePen(_props, ref) {
  return (
    <span ref={ref} className="lw-pen" aria-hidden data-lw-skip>
      <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
        <path className="lw-pen-body" d="M15.6 3.5l4.9 4.9L9.8 19.1l-5.4 1.5a.6.6 0 0 1-.74-.74l1.5-5.4z" />
        <path className="lw-pen-band" d="M13.9 5.2l4.9 4.9" />
        <path className="lw-pen-tip" d="M3.7 20.3l1.2-4.1 2.9 2.9z" />
      </svg>
    </span>
  );
});
