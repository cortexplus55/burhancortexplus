"use client";

import { useEffect, useRef } from "react";

/**
 * Açık bir pencereyi Esc ile kapatır (UX tur 2: rozet penceresi Esc'e tepki vermiyordu).
 * `active` false iken dinleyici eklenmez; geri çağrı her çizimde güncel tutulur.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
