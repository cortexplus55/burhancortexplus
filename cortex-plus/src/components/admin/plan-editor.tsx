"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePlan } from "@/app/admin/actions";

/**
 * Paket satırı düzenleyici.
 *
 * Değerler değişmeden "Kaydet" düğmesi açılmıyor: yanlışlıkla aynı değeri
 * tekrar yazmak bir kayıt oluşturuyor ve işlem geçmişini gereksiz şişiriyordu.
 */
export function PlanEditor({
  planId,
  price,
  credits,
  active,
}: {
  planId: string;
  price: number;
  credits: number;
  active: boolean;
}) {
  const [nextPrice, setNextPrice] = useState(String(price));
  const [nextCredits, setNextCredits] = useState(String(credits));
  const [nextActive, setNextActive] = useState(active);
  const [pending, startTransition] = useTransition();

  const priceNum = Number(nextPrice);
  const creditsNum = Number(nextCredits);
  const valid =
    Number.isInteger(priceNum) && priceNum >= 0 && Number.isInteger(creditsNum) && creditsNum >= 0;
  const changed =
    priceNum !== price || creditsNum !== credits || nextActive !== active;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-1 text-xs text-[var(--adm-muted)]">
        ₺
        <input
          type="number"
          min={0}
          value={nextPrice}
          onChange={(event) => setNextPrice(event.target.value)}
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
              priceTry: priceNum,
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
