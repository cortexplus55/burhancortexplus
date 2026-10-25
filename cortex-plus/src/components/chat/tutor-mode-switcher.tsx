"use client";

import { LIVE_TUTOR_STYLE_OPTIONS, type TutorStyle } from "@/lib/learning/tutor-style";

export function TutorModeSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: TutorStyle;
  onChange: (next: TutorStyle) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cp-tutor-mode" role="radiogroup" aria-label="Anlatım modu">
      {LIVE_TUTOR_STYLE_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={option.label}
            aria-label={option.label}
            className={selected ? "cp-tutor-mode-pill is-on" : "cp-tutor-mode-pill"}
            onClick={() => {
              if (!selected) onChange(option.id);
            }}
          >
            <span aria-hidden>{option.emoji}</span>
            <span className="cp-tutor-mode-full">{option.label}</span>
            <span className="cp-tutor-mode-short">{option.short}</span>
          </button>
        );
      })}
    </div>
  );
}
