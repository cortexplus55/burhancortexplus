"use client";

import { useEffect, useRef, useState } from "react";
import "@/styles/arena.css";

/*
  Süre halkası (Faz 4A). `role="timer"`, sürekli okuma yok (`aria-live` kapalı); yalnız 10 ve 5 saniye eşiğinde birer kez
  duyurur. Son `warnAt` saniyede 1 sn'lik nabız (ölçek ≤ %3); hareket azaltmada yalnız renk ve sayı.
*/

const R = 20;
const C = 2 * Math.PI * R;

export function timerAnnouncement(remaining: number, already: ReadonlySet<number>): number | null {
  for (const mark of [10, 5]) {
    if (remaining <= mark && remaining > 0 && !already.has(mark)) return mark;
  }
  return null;
}

export function TimerRing({ total, remaining, warnAt = 5, label = "Kalan süre" }: { total: number; remaining: number; warnAt?: number; label?: string }) {
  const [said, setSaid] = useState<string>("");
  const announced = useRef(new Set<number>());
  const left = Math.max(0, Math.ceil(remaining));
  const warn = left > 0 && left <= warnAt;

  useEffect(() => {
    if (left > 10) announced.current.clear();
    const mark = timerAnnouncement(left, announced.current);
    if (mark !== null) {
      // 10'un altına sıçrayan süre (ör. 7) yalnız en yakın eşiği duyurur.
      for (const m of [10, 5]) if (left <= m) announced.current.add(m);
      setSaid(`${left} saniye kaldı`);
    }
  }, [left]);

  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div className="cx-timer" data-warn={warn ? "" : undefined} role="timer" aria-live="off" aria-label={`${label}: ${left} saniye`}>
      <svg viewBox="0 0 48 48" aria-hidden className="cx-timer-svg">
        <circle cx="24" cy="24" r={R} className="cx-timer-track" />
        <circle cx="24" cy="24" r={R} className="cx-timer-arc" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} />
      </svg>
      <span className="cx-t-meta-m cx-timer-num" aria-hidden>
        {left}
      </span>
      <span className="sr-only" aria-live="assertive">
        {said}
      </span>
    </div>
  );
}
