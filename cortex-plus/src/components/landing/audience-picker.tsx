"use client";

import { useId, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { GUEST_DEMO_TRACKS, HERO_PICK_ARIA, HERO_PICKS, heroPickName, type GuestTrackId } from "@/lib/marketing/guest-demo-tracks";
import "@/styles/landing-showcase.css";

/**
 * Kahramanın TEK seçicisi (Faz 9, 20 Kasım 2026). Önce kahramanda dört hedef kitle sekmesi, turun üstünde ayrıca dört
 * seçenekli bir branş şeridi vardı; ziyaretçi ikisini ayrı şeyler sanıyordu. Şimdi dört seçenek tek yerde: her biri bir
 * branş (örnek not) ve bir profil (kahramanın cümlesi, kayıt bağlantısı). Seçim kahramanın cümlesini, kayıt düğmesini
 * ve turu birlikte değiştirir.
 *
 * Tek seçimli grup (`radiogroup`): ok tuşları seçimi ve odağı birlikte kaydırır, yalnız seçili seçenek sekmeyle odak
 * alır. Seçenek iki satır (ad + alan); ekran okuyucu ikisini tek ad olarak okur ("Üniversite · Mühendislik"). Her
 * seçenek en az 56 px yüksek; telefonda iki sütun, iç kaydırma yok.
 */
export function AudiencePicker({
  value,
  onChange,
  controls,
}: {
  value: GuestTrackId;
  onChange: (id: GuestTrackId) => void;
  /** Seçicinin yönettiği bölgenin kimliği (`aria-controls`): tur. */
  controls?: string;
}) {
  const baseId = useId();
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let delta = keys[event.key];
    const at = HERO_PICKS.findIndex((pick) => pick.track === value);
    if (event.key === "Home") delta = -at;
    if (event.key === "End") delta = HERO_PICKS.length - 1 - at;
    if (delta === undefined) return;
    event.preventDefault();
    const next = HERO_PICKS[(at + delta + HERO_PICKS.length) % HERO_PICKS.length]!;
    onChange(next.track);
    document.getElementById(`${baseId}-${next.track}`)?.focus();
  }
  return (
    <div className="lp-pick" role="radiogroup" aria-label={HERO_PICK_ARIA} onKeyDown={onKey} data-hero-pick>
      {HERO_PICKS.map(({ track }) => {
        const on = track === value;
        const item = GUEST_DEMO_TRACKS[track];
        return (
          <button
            key={track}
            id={`${baseId}-${track}`}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={heroPickName(track)}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            className={cn("lp-pick-opt", on && "is-on")}
            data-track={track}
            onClick={() => onChange(track)}
          >
            <span className="lp-pick-name">{item.pickLabel}</span>
            <span className="lp-pick-field">{item.field}</span>
          </button>
        );
      })}
    </div>
  );
}
