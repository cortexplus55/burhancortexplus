"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import "@/styles/arena.css";

/*
  Açılış dizisi (Faz 4A). Sahte bekleme YOK: ilerleme dışarıdan, gerçek işin ilerlemesidir. 3-2-1 yalnız iş hazır
  olunca (`ready` → `countdown`) başlar ve `onDone` ile biter. "Atla" yalnız hazırken. Hareket azaltmada düz metin
  adımları (sayı geri sayımı yok, doğrudan `onDone`).
*/

export type LaunchPhase = "preparing" | "ready" | "countdown";

export function LaunchSequence({
  phase,
  slots,
  progress,
  onDone,
  onSkip,
}: {
  phase: LaunchPhase;
  /** Hazırlanan parçaların adları (ör. "Sorular", "Rakip"). */
  slots: readonly string[];
  /** 0–1, gerçek iş ilerlemesi. */
  progress: number;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(3);
  const done = useRef(false);

  useEffect(() => {
    if (phase !== "countdown") return;
    done.current = false;
    if (reduce) {
      done.current = true;
      onDone();
      return;
    }
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        if (!done.current) {
          done.current = true;
          onDone();
        }
        return;
      }
      setCount(n);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, reduce, onDone]);

  const filled = Math.round(Math.max(0, Math.min(1, progress)) * slots.length);
  return (
    <div className="cx-launch" data-phase={phase}>
      {phase === "countdown" && !reduce ? (
        <p key={count} className="cx-t-num-l cx-launch-count" aria-live="assertive">
          {count}
        </p>
      ) : (
        <ol className="cx-launch-slots" aria-live="polite">
          {slots.map((slot, index) => (
            <li key={slot} className="cx-t-label-13" data-done={index < filled ? "" : undefined}>
              {slot}
            </li>
          ))}
        </ol>
      )}
      {phase === "ready" && onSkip ? (
        <button type="button" className="cx-weak cx-t-button-s cx-launch-skip" onClick={onSkip}>
          Atla
        </button>
      ) : null}
    </div>
  );
}
