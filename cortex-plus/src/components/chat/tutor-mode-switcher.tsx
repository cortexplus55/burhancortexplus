"use client";

import { useId, useState } from "react";
import { LIVE_TUTOR_STYLE_OPTIONS, type TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Anlatım modu anahtarı. Bir moda dokununca altında o modun ne yaptığını söyleyen tek cümle açılır (10 Kasım 2026);
 * seçili moda yeniden dokunmak açıklamayı açıp kapatır, mesaj gönderilince (`disabled`) kapanır: okuma alanı daralmaz.
 * Açıklama metni `tutor-style.ts`'te; düğmenin ipucu da aynı metni taşır.
 */
export function TutorModeSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: TutorStyle;
  onChange: (next: TutorStyle) => void;
  disabled?: boolean;
}) {
  const descriptionId = useId();
  const [explained, setExplained] = useState(false);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setExplained(false);
  }
  const active = LIVE_TUTOR_STYLE_OPTIONS.find((option) => option.id === value);
  const showDescription = explained && !disabled && Boolean(active);

  return (
    <>
      <div className="cp-tutor-mode" role="radiogroup" aria-label="Anlatım modu">
        {LIVE_TUTOR_STYLE_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-describedby={selected && showDescription ? descriptionId : undefined}
              disabled={disabled}
              title={`${option.label}: ${option.description}`}
              aria-label={option.label}
              className={selected ? "cp-tutor-mode-pill is-on" : "cp-tutor-mode-pill"}
              onClick={() => {
                if (selected) {
                  setExplained((open) => !open);
                  return;
                }
                onChange(option.id);
                setExplained(true);
              }}
            >
              <span aria-hidden>{option.emoji}</span>
              <span className="cp-tutor-mode-full">{option.label}</span>
              <span className="cp-tutor-mode-short">{option.short}</span>
            </button>
          );
        })}
      </div>
      {showDescription && active ? (
        <p id={descriptionId} className="cp-tutor-mode-desc" role="status">
          <span className="cp-tutor-mode-desc-name">{active.label.replace(/\s*\(.*\)$/, "")}:</span> {active.description}
        </p>
      ) : null}
    </>
  );
}
