"use client";

import { useEffect } from "react";
import type { LearningSurface } from "@/lib/learning/learning-time";

/** Son etkileşimden bu kadar sonra sayaç durur; uzun paragraf okumaya yer bırakır. */
const IDLE_MS = 120_000;
const FLUSH_MS = 30_000;
const ENDPOINT = "/api/activity/time";

/**
 * Ekranda aktif geçen süreyi sayar ve sunucuya yazar.
 *
 * Sekme görünür değilse ya da öğrenci iki dakikadır dokunmadıysa saymaz:
 * Astra sitede geçen her dakikayı öğrenme süresi sayıyor, biz yalnızca
 * ders, test ve sohbette çalışılan süreyi (30 Eylül 2026).
 */
export function useLearningTimer(surface: LearningSurface, subject: string | null, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let pending = 0;
    let lastInput = Date.now();
    const mark = () => {
      lastInput = Date.now();
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput < IDLE_MS) pending += 1;
    }, 1000);
    const flush = (beacon: boolean) => {
      const seconds = Math.min(pending, 120);
      if (seconds < 5) return;
      pending -= seconds;
      const body = JSON.stringify({ seconds, surface, subject: subject ?? "" });
      if (beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };
    const every = window.setInterval(() => flush(false), FLUSH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
      else mark();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const name of events) window.addEventListener(name, mark, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(every);
      for (const name of events) window.removeEventListener(name, mark, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      flush(true);
    };
  }, [surface, subject, enabled]);
}
