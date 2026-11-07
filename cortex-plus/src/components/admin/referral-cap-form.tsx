"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveReferralGiftCap } from "@/app/admin/eposta-actions";
import { REFERRAL_CAP_MAX, REFERRAL_CAP_MIN } from "@/lib/email/referral-cap";

/** Kurucu davet hediyesinin günlük tavanını (kaç davet çifti) yazar; bir sonraki hediyeden itibaren geçerlidir. */
export function ReferralCapForm({ current }: { current: number }) {
  const [value, setValue] = useState(String(current));
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveReferralGiftCap(value);
          const text = result.ok ? result.message : result.error;
          setNote(text);
          if (result.ok) toast.success(text);
          else toast.error(text);
        });
      }}
    >
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Günlük tavan (çift sayısı)
        <input
          name="cap"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`${REFERRAL_CAP_MIN}–${REFERRAL_CAP_MAX}`}
          className="adm-input w-32"
          aria-label="Davet hediyesi günlük tavanı (çift sayısı)"
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
