"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPromoCode, togglePromoCode } from "@/app/admin/actions";

/** Yeni kampanya kodu formu. */
export function PromoCreateForm() {
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("100");
  const [limit, setLimit] = useState("");
  const [pending, startTransition] = useTransition();

  const creditsNum = Number(credits);
  const limitNum = limit.trim() ? Number(limit) : null;
  const valid =
    code.trim().length >= 3 &&
    /^[A-Za-z0-9-]+$/.test(code.trim()) &&
    Number.isInteger(creditsNum) &&
    creditsNum > 0 &&
    (limitNum === null || (Number.isInteger(limitNum) && limitNum > 0));

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Kod
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ORNEK-2026"
          aria-label="Kampanya kodu"
          className="adm-input"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Hediye kredi
        <input
          type="number"
          min={1}
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          aria-label="Hediye kredi"
          className="adm-input w-32"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Kaç kişi (boş = sınırsız)
        <input
          type="number"
          min={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="sınırsız"
          aria-label="Kullanım sınırı"
          className="adm-input w-40"
        />
      </label>

      <button
        type="button"
        className="adm-btn adm-btn--primary"
        disabled={pending || !valid}
        onClick={() =>
          startTransition(async () => {
            const result = await createPromoCode({
              code: code.trim(),
              creditAmount: creditsNum,
              maxRedemptions: limitNum,
            });
            if (result.ok) {
              toast.success(result.message ?? "Kod oluşturuldu.");
              setCode("");
              setLimit("");
            } else {
              toast.error(result.error ?? "Oluşturulamadı.");
            }
          })
        }
      >
        {pending ? "Oluşturuluyor…" : "Kod oluştur"}
      </button>
    </div>
  );
}

/** Kodu açıp kapatan düğme. */
export function PromoToggle({ promoId, active }: { promoId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={`adm-btn${active ? " adm-btn--danger" : ""}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await togglePromoCode(promoId, !active);
          if (result.ok) toast.success(result.message ?? "Güncellendi.");
          else toast.error(result.error ?? "Güncellenemedi.");
        })
      }
    >
      {pending ? "…" : active ? "Kapat" : "Aç"}
    </button>
  );
}
