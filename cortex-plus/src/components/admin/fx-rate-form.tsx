"use client";

import { useState, useTransition } from "react";
import { saveUsdTryRate } from "@/app/admin/cockpit-actions";
import { FX_MAX, FX_MIN } from "@/lib/admin/cockpit-math";

/** Kurucu 1 USD = ? TL girer; kâr marjı bu kurla hesaplanır. Kur yoksa marj "—" kalır. */
export function FxRateForm({ current }: { current: number | null }) {
  const [value, setValue] = useState(current ? String(current) : "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const rate = Number(value.replace(",", "."));
        startTransition(async () => {
          const result = await saveUsdTryRate(rate);
          setNote(result.ok ? result.message : result.error);
        });
      }}
    >
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        1 USD = ? TL
        <input
          name="rate"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`${FX_MIN}–${FX_MAX}`}
          className="adm-input w-32"
          aria-label="Dolar kuru (TL)"
        />
      </label>
      <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kuru kaydet"}
      </button>
      {note ? (
        <span role="status" className="text-xs text-[var(--adm-muted)]">
          {note}
        </span>
      ) : null}
    </form>
  );
}
