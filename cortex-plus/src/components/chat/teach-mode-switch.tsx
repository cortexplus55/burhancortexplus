"use client";

import { useId, useState } from "react";
import { TEACH_MODE_V2_OPTIONS, type TeachModeV2 } from "@/lib/learning/tutor-style";
import "@/styles/teacher-v2-sohbet.css";

/**
 * Faz 11 (teacher.v2, ana sohbet): iki anlatım tek dokunuşla ("Adım Adım Öğret", "Hızlı Özet"). Bugünkü anlatım
 * anahtarının (`TutorModeSwitcher`) yapısı ve sınıfları: dokununca altında modun ne yaptığını söyleyen tek cümle açılır,
 * seçili moda yeniden dokunmak açıp kapatır, mesaj gönderilince (`disabled`) kapanır. Bayrak kapalıyken çizilmez.
 */
export function TeachModeSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: TeachModeV2;
  onChange: (next: TeachModeV2) => void;
  disabled?: boolean;
}) {
  const descriptionId = useId();
  const [explained, setExplained] = useState(false);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setExplained(false);
  }
  const active = TEACH_MODE_V2_OPTIONS.find((option) => option.id === value);
  const showDescription = explained && !disabled && Boolean(active);

  return (
    <>
      <div className="cp-tutor-mode cx-v2-mode" role="radiogroup" aria-label="Anlatım modu">
        {TEACH_MODE_V2_OPTIONS.map((option) => {
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
          <span className="cp-tutor-mode-desc-name">{active.label}:</span> {active.description}
        </p>
      ) : null}
    </>
  );
}
