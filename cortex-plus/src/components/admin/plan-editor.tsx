"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePlan } from "@/app/admin/actions";
import { kurusToTry, tryToKurus } from "@/lib/format";

/**
 * Paket satırı düzenleyici.
 *
 * DB `price_try` kuruş tutar. Giriş alanı TL gösterir; kayıtta kuruşa çevrilir.
 * Eski hâl ham kuruşu "₺" etiketiyle gösteriyordu — 59900 yazıp 599 sanmak
 * mümkün değildi; 599 yazmak ise ₺5,99'a düşürüyordu.
 */
export function PlanEditor({
  planId,
  price,
  credits,
  active,
}: {
  planId: string;
  /** Kuruş (DB). */
  price: number;
  credits: number;
  active: boolean;
}) {
  const [nextPriceTl, setNextPriceTl] = useState(String(kurusToTry(price)));
  const [nextCredits, setNextCredits] = useState(String(credits));
  const [nextActive, setNextActive] = useState(active);
  const [pending, startTransition] = useTransition();

  const priceTl = Number(nextPriceTl);
  const creditsNum = Number(nextCredits);
  const priceKurus = Number.isFinite(priceTl) ? tryToKurus(priceTl) : NaN;
  const valid =
    Number.isFinite(priceTl) &&
    priceTl >= 0 &&
    Number.isInteger(priceKurus) &&
    priceKurus >= 0 &&
    Number.isInteger(creditsNum) &&
    creditsNum >= 0;
  const changed =
    priceKurus !== price || creditsNum !== credits || nextActive !== active;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-1 text-xs text-[var(--adm-muted)]">
        TL
        <input
          type="number"
          min={0}
          step={1}
          value={nextPriceTl}
          onChange={(event) => setNextPriceTl(event.target.value)}
          aria-label="Fiyat (TL)"
          className="adm-input w-24"
        />
      </label>

      <label className="flex items-center gap-1 text-xs text-[var(--adm-muted)]">
        kredi
        <input
          type="number"
          min={0}
          value={nextCredits}
          onChange={(event) => setNextCredits(event.target.value)}
          aria-label="Verilecek kredi"
          className="adm-input w-24"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-[var(--adm-muted)]">
        <input
          type="checkbox"
          checked={nextActive}
          onChange={(event) => setNextActive(event.target.checked)}
        />
        Satışta
      </label>

      <button
        type="button"
        className="adm-btn adm-btn--primary"
        disabled={pending || !valid || !changed}
        onClick={() =>
          startTransition(async () => {
            const result = await updatePlan({
              planId,
              priceTry: priceKurus,
              creditAmount: creditsNum,
              active: nextActive,
            });
            if (result.ok) toast.success(result.message ?? "Kaydedildi.");
            else toast.error(result.error ?? "Kaydedilemedi.");
          })
        }
      >
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );
}
