"use client";

import { useLayoutEffect, type RefObject } from "react";

/** CSS'te üst sınır yoksa (ya da okunamazsa) yazma alanının üst sınırı: 8rem (`.cp-sor-composer-box textarea`). */
export const AUTO_GROW_FALLBACK_MAX_PX = 128;

/**
 * Yazma alanının yeni yüksekliği: içerik kadar, CSS'teki `max-height`'ı geçmeden. Üst sınıra varınca alan kendi
 * içinde kayar. Saf; test edilir.
 */
export function autoGrowHeight(scrollHeight: number, maxHeight: number): { height: number; overflow: "hidden" | "auto" } {
  const max = Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : AUTO_GROW_FALLBACK_MAX_PX;
  const height = Math.min(Math.max(0, Math.ceil(scrollHeight)), max);
  return { height, overflow: scrollHeight > max ? "auto" : "hidden" };
}

/** Tarayıcı `field-sizing: content` biliyorsa büyümeyi CSS yapar (Chrome); bilmiyorsa (Safari, Firefox) bu kanca. */
export function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
}

/**
 * Otomatik büyüyen yazma alanının JS yedeği (20 Kasım 2026, Faz 3). `/ogretmen` yazma alanı yalnız CSS
 * `field-sizing` ile büyüyordu; Safari ve Firefox bunu desteklemiyor, alan iki satırda kalıp kendi içinde
 * kayıyordu. Her değer değişiminde yükseklik `scrollHeight`'a göre yeniden ölçülür; üst sınır CSS'teki
 * `max-height` (~8rem), CSS'e yeni sayı yazılmaz.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || supportsFieldSizing()) return;
    const maxHeight = Number.parseFloat(window.getComputedStyle(el).maxHeight);
    el.style.height = "auto";
    // Gizli alan (ölçü 0) sıfır yüksekliğe çekilmez; CSS'teki boyuna bırakılır.
    if (el.scrollHeight <= 0) {
      el.style.height = "";
      return;
    }
    const next = autoGrowHeight(el.scrollHeight, maxHeight);
    el.style.height = `${next.height}px`;
    el.style.overflowY = next.overflow;
  }, [ref, value]);
}
