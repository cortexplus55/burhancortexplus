"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { TEACH_STYLE_OPTIONS, type TeachStyle } from "@/lib/learning/tutor-style";

/**
 * "Nasıl anlatayım?" (Faz 13 PR-1, teacher.v2): dört anlatım tek hapta; varsayılan Rehberli. Bayrak kapalıyken
 * çizilmez (yerinde bugünkü üç düğmelik anahtar durur). Kaynak hapıyla aynı yapı ve sınıflar: dokununca açıklamalı
 * menü, dışarıya dokunmak ve Esc kapatır.
 */
export function TeachStyleMenu({
  value,
  onChange,
  disabled = false,
}: {
  value: TeachStyle;
  onChange: (next: TeachStyle) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const current = TEACH_STYLE_OPTIONS.find((option) => option.id === value) ?? TEACH_STYLE_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hap satırın ortasında durabilir (kaynak hapı solda): menü sağdan taşmasın diye açılınca ölçülüp sola kaydırılır.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || typeof window === "undefined") return;
    menu.style.transform = "";
    const rect = menu.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 12);
    const shift = Math.min(Math.max(0, overflow), Math.max(0, rect.left - 12));
    if (shift > 0) menu.style.transform = `translateX(-${Math.round(shift)}px)`;
  }, [open]);

  return (
    <div className="cp-source-pill cp-teach-style" ref={rootRef}>
      <button
        type="button"
        className="cp-ctrl-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Nasıl anlatayım? Şu an: ${current.label}`}
        title={`${current.label}: ${current.description}`}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
      >
        <span aria-hidden>{current.emoji}</span>
        <span className="cp-ctrl-pill-label">{current.short}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      {open ? (
        <div className="cp-source-menu" role="menu" aria-label="Nasıl anlatayım?" ref={menuRef}>
          {TEACH_STYLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              className="cp-source-menu-item"
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span className="cp-source-menu-icon" aria-hidden>
                {option.emoji}
              </span>
              <span className="cp-source-menu-text">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              {option.id === value ? <Check className="h-4 w-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
