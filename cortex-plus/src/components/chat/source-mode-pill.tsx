"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Kaynak seçimi tek hap (8 Kasım 2026, ürün sahibinin onayı: "sohbet altını kompaktlaştır"). Önce yazma alanının
 * üstünde üç düğmelik ayrı bir satırdı; mod düğmeleri ve ders sekmesiyle birlikte telefonda ekranın yarısını alıyor,
 * cevabı okumaya 212 px kalıyordu. Şimdi mod düğmeleri ve ders seçimiyle aynı satırda küçük bir hap; dokununca
 * üç seçenek açıklamalarıyla açılır.
 */
export type SourceMode = "only" | "mixed" | "general";

const OPTIONS: { id: SourceMode; icon: string; label: string; short: string; hint: string }[] = [
  { id: "only", icon: "🔒", label: "Yalnızca belgem", short: "Belgem", hint: "Cevap yalnız yüklediğin belgelerden" },
  { id: "mixed", icon: "📄", label: "Belgem + genel bilgi", short: "Belge+", hint: "Önce belgen; eksik kalanı genel bilgiden, etiketli" },
  { id: "general", icon: "🌐", label: "Genel sohbet", short: "Genel", hint: "Belgeye bakmadan, genel bilgiyle" },
];

export function SourceModePill({
  value,
  onChange,
  disabled = false,
}: {
  value: SourceMode;
  onChange: (next: SourceMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = OPTIONS.find((option) => option.id === value) ?? OPTIONS[2]!;

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

  return (
    <div className="cp-source-pill" ref={rootRef}>
      <button
        type="button"
        className="cp-ctrl-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kaynak: ${current.label}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{current.icon}</span>
        <span className="cp-ctrl-pill-label">{current.short}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      {open ? (
        <div className="cp-source-menu" role="menu" aria-label="Kaynak modu">
          {OPTIONS.map((option) => (
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
                {option.icon}
              </span>
              <span className="cp-source-menu-text">
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </span>
              {option.id === value ? <Check className="h-4 w-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
