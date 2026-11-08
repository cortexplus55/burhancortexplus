"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { testResendDelivery } from "@/app/admin/eposta-actions";

/**
 * Resend durumu kartının düğmesi (8 Kasım 2026): kurucunun kendi adresine yalnız Resend ile deneme gönderir ve
 * Resend'in gerçek cevabını gösterir (yedek yola düşmez).
 */
export function ResendProbeButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    startTransition(async () => {
      const response = await testResendDelivery();
      if (response.ok) {
        setResult({ ok: true, text: `Resend ile ${response.to} adresine gönderildi. Gelen kutunu ve spam klasörünü kontrol et.` });
        toast.success("Deneme e-postası Resend ile gönderildi.");
      } else {
        setResult({ ok: false, text: response.error });
        toast.error("Resend gönderemedi.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" className="adm-btn" disabled={pending} onClick={run}>
        {pending ? "Gönderiliyor…" : "Resend ile kendime deneme gönder"}
      </button>
      {result ? (
        <p className="text-sm" role="status" style={{ color: result.ok ? "var(--adm-ok, #16a34a)" : "var(--adm-bad, #dc2626)" }}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
