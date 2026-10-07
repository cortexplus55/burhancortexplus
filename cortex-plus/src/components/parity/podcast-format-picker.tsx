"use client";

import {
  DEFAULT_PODCAST_LENGTH,
  PODCAST_FORMAT_OPTIONS,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import { cn } from "@/lib/utils";

/** Podcast türü — Astra'daki beş tür; ilki önerilen (1 Ekim 2026). */
export function PodcastFormatPicker({
  value,
  onChange,
}: {
  value: PodcastLength;
  onChange: (value: PodcastLength) => void;
}) {
  return (
    <fieldset className="cp-pod-formats">
      <legend>Podcast türü</legend>
      {PODCAST_FORMAT_OPTIONS.map((option) => (
        <label key={option.id} className={cn("cp-pod-format", value === option.id && "is-on")}>
          <input
            type="radio"
            name="podcast-format"
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          <span className="cp-pod-format-emoji" aria-hidden>
            {option.emoji}
          </span>
          <span className="cp-pod-format-text">
            <strong>
              {option.label} <em>~{option.minutes} dk</em>
            </strong>
            <span>{option.blurb}</span>
          </span>
          {option.id === DEFAULT_PODCAST_LENGTH ? <span className="cp-pod-format-badge">Önerilen</span> : null}
        </label>
      ))}
    </fieldset>
  );
}
