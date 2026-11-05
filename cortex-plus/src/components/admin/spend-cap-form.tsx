"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDailySpendCap } from "@/app/admin/cockpit-actions";
import { SPEND_CAP_MAX_USD, SPEND_CAP_MIN_USD } from "@/lib/billing/spend-breaker-copy";

/** Kurucu günlük OpenAI tavanını dolar olarak yazar; sigorta bir dakika içinde yeni tavanı okur. */
export function SpendCapForm({ current, source }: { current: number; source: "flag" | "env" | "default" }) {
  const [value, setValue] = useState(String(current));
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sourceLabel = source === "flag" ? "kokpitten" : source === "env" ? "ortam değişkeninden" : "varsayılan";

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const cap = Number(value.replace(",", "."));
        startTransition(async () => {
          const result = await saveDailySpendCap(cap);
          setNote(result.ok ? result.message : result.error);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        });
      }}
    >
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Günlük tavan ($, {sourceLabel})
        <input
          name="cap"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`${SPEND_CAP_MIN_USD}–${SPEND_CAP_MAX_USD}`}
          className="adm-input w-32"
          aria-label="Günlük OpenAI harcama tavanı (dolar)"
        />
      </label>
      <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Tavanı kaydet"}
      </button>
      {note ? (
        <span role="status" className="text-xs text-[var(--adm-muted)]">
          {note}
        </span>
      ) : null}
    </form>
  );
}
