"use client";

import { useId, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { AUDIENCE_SEGMENTS, type AudienceSegmentId } from "@/lib/marketing/landing-showcase";
import "@/styles/landing-showcase.css";

/**
 * Dört hedef kitle sekmesi (7 Kasım 2026). Kahramanda ve vitrinde aynı durumu değiştirir; ok tuşlarıyla gezilir.
 * Telefonda iki satıra sarar; her sekme en az 44 px yüksek (dokunma alanı).
 */
export function AudienceTabs({
  value,
  onChange,
  compact = false,
  controls,
}: {
  value: AudienceSegmentId;
  onChange: (id: AudienceSegmentId) => void;
  compact?: boolean;
  /** Sekmelerin yönettiği bölgenin kimliği (`aria-controls`). */
  controls?: string;
}) {
  const baseId = useId();
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = AUDIENCE_SEGMENTS.findIndex((segment) => segment.id === value);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = AUDIENCE_SEGMENTS[(at + step + AUDIENCE_SEGMENTS.length) % AUDIENCE_SEGMENTS.length]!;
      onChange(next.id);
      document.getElementById(`${baseId}-${next.id}`)?.focus();
    }
  }
  return (
    <div
      className={cn("lp-aud-tabs", compact && "lp-aud-tabs--compact")}
      role="tablist"
      aria-label="Hangi sınava hazırlanıyorsun?"
      onKeyDown={onKey}
    >
      {AUDIENCE_SEGMENTS.map((segment) => {
        const selected = segment.id === value;
        return (
          <button
            key={segment.id}
            id={`${baseId}-${segment.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            className={cn("lp-aud-tab", selected && "is-on")}
            onClick={() => onChange(segment.id)}
          >
            {segment.tab}
          </button>
        );
      })}
    </div>
  );
}
