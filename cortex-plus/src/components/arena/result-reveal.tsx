"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import "@/styles/arena.css";

/** Sonucun sayarak açılması (Faz 4A): en çok 1 sn; hareket azaltmada doğrudan son değer. Ekran okuyucu yalnız son değeri okur. */
export const RESULT_MAX_MS = 1000;

export function ResultReveal({
  from = 0,
  value,
  duration = RESULT_MAX_MS,
  format = (n: number) => String(Math.round(n)),
}: {
  from?: number;
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : from);
  const ms = Math.min(RESULT_MAX_MS, Math.max(0, duration));

  useEffect(() => {
    if (reduce || ms === 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, value, ms, reduce]);

  return (
    <span className="cx-reveal">
      <span aria-hidden className="cx-t-num-l">
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
