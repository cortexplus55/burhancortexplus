"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Geri alınması zor işlemler için iki adımlı düğme.
 *
 * Ayrı bir onay penceresi yerine düğmenin kendisi soruyor: ilk tıkta metin
 * "Emin misin?" oluyor, ikinci tık işlemi yapıyor. Beş saniye içinde
 * dokunulmazsa kendiliğinden geri dönüyor — yanlışlıkla açık kalmış bir
 * onayın orada beklemesi istenmez.
 */
export function ConfirmAction({
  label,
  confirmLabel = "Emin misin?",
  successMessage,
  danger = false,
  disabled = false,
  action,
}: {
  label: string;
  confirmLabel?: string;
  successMessage: string;
  danger?: boolean;
  disabled?: boolean;
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 5000);
      return;
    }
    setArmed(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(successMessage);
      else toast.error(result.error ?? "İşlem yapılamadı.");
    });
  }

  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={run}
      className={cn("adm-btn", danger && "adm-btn--danger")}
    >
      {pending ? "Yapılıyor…" : armed ? confirmLabel : label}
    </button>
  );
}
