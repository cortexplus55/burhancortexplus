"use client";

import { useId, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import "@/styles/node-coach.css";

export type DifficultyLevel = "kolay" | "orta" | "ileri";

/**
 * Etkinlik kurulumunda zorluk seçimi (8 Kasım 2026). Önceki 3 basamaklı sürgü kutu dolgusunu (`.cp-field input`)
 * aldığı için tutamak sona ulaşmıyordu ve seviyenin ne demek olduğu yazmıyordu. Üç kart: ad, kısa anlam ve seviye
 * çubukları; ok tuşlarıyla gezilir (radyo grubu).
 */
export const DIFFICULTY_OPTIONS: { id: DifficultyLevel; label: string; hint: string; bars: number }[] = [
  { id: "kolay", label: "Kolay", hint: "Tanım ve temel ayrım", bars: 1 },
  { id: "orta", label: "Orta", hint: "Kısa vaka, kardeş kavramları ayırt etme", bars: 2 },
  { id: "ileri", label: "İleri", hint: "Sınav ayarında zor, çok adımlı sorular", bars: 3 },
];

export function DifficultyPicker({ value, onChange }: { value: DifficultyLevel; onChange: (value: DifficultyLevel) => void }) {
  const baseId = useId();
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const at = DIFFICULTY_OPTIONS.findIndex((option) => option.id === value);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = DIFFICULTY_OPTIONS[(at + step + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length]!;
    onChange(next.id);
    document.getElementById(`${baseId}-${next.id}`)?.focus();
  }
  return (
    <div className="cp-diff" role="radiogroup" aria-labelledby={`${baseId}-title`} onKeyDown={onKey}>
      <p id={`${baseId}-title`} className="cp-diff-title">
        Zorluk seviyesi
      </p>
      <div className="cp-diff-options">
        {DIFFICULTY_OPTIONS.map((option) => {
          const on = option.id === value;
          return (
            <button
              key={option.id}
              id={`${baseId}-${option.id}`}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={cn("cp-diff-option", on && "is-on", `cp-diff-option--${option.id}`)}
              onClick={() => onChange(option.id)}
            >
              <span className="cp-diff-bars" aria-hidden>
                {[1, 2, 3].map((bar) => (
                  <span key={bar} className={bar <= option.bars ? "is-filled" : undefined} />
                ))}
              </span>
              <span className="cp-diff-label">{option.label}</span>
              <span className="cp-diff-hint">{option.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
