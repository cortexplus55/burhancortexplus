"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { liveAutoplay, type LiveSpeed } from "@/lib/learning/live-writing";
import { canAnimateLive, createLiveEngine, type LiveEngine } from "./live-engine";

/**
 * Canlı Defter yazımının yaşam döngüsü (28 Kasım 2026).
 *
 * - `off`: canlı mod kapalı ya da adım yazılabilir değil (önsöz, tekrar kapısı…).
 * - `playing`: adım yazılıyor ("Hepsini göster" görünür).
 * - `done`: içerik tam açık; "Tekrar oynat" görünür (yazım bitti, geri dönülen adım ya da başlanmış ders).
 * - `static`: hareket azaltma açık ya da tarayıcı canlandıramıyor; içerik hep tam açık, yazım düğmesi yok.
 *
 * Adım kendiliğinden yalnız bu oturumda ilk girişte yazılır (`liveAutoplay`).
 */
export type LivePhase = "off" | "playing" | "done" | "static";

export function useLiveWriting(
  scopeRef: RefObject<HTMLElement | null>,
  penRef: RefObject<HTMLElement | null>,
  options: { enabled: boolean; stepKey: string; typeable: boolean; autoplay: boolean; speed: LiveSpeed; reducedMotion: boolean },
): { phase: LivePhase; showAll: () => void; replay: () => void } {
  const { enabled, stepKey, typeable, autoplay, speed, reducedMotion } = options;
  const [phase, setPhase] = useState<LivePhase>("off");
  const engineRef = useRef<LiveEngine | null>(null);
  const visitedRef = useRef(new Set<string>());
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
    engineRef.current?.setSpeed(speed);
  }, [speed]);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!enabled || !scope) {
      setPhase("off");
      return;
    }
    const engine = createLiveEngine(scope, penRef.current, { speed: speedRef.current, onPhase: setPhase });
    engineRef.current = engine;
    if (!typeable) {
      engine.settle();
      setPhase("off");
    } else if (reducedMotion || !canAnimateLive()) {
      engine.settle();
      setPhase("static");
    } else if (liveAutoplay({ typeable, autoplay, reducedMotion, visited: visitedRef.current.has(stepKey) })) {
      visitedRef.current.add(stepKey);
      engine.play();
    } else {
      engine.settle();
      setPhase("done");
    }
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [enabled, stepKey, typeable, autoplay, reducedMotion, scopeRef, penRef]);

  const showAll = useCallback(() => engineRef.current?.showAll(), []);
  const replay = useCallback(() => engineRef.current?.play(), []);
  return { phase, showAll, replay };
}
