"use client";

import Link from "next/link";
import { useState } from "react";

/** Sayfadaki onay düğmesi: e-postadaki bağlantı yalnız bu sayfayı açar, çıkış düğmeye basınca olur. */
export function UnsubscribeButton({ token, label, doneText }: { token: string; label: string; doneText: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  async function submit() {
    setState("busy");
    try {
      const response = await fetch(`/api/email/abonelik?t=${encodeURIComponent(token)}`, { method: "POST" });
      setState(response.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="space-y-3">
        <p className="text-base font-semibold text-[var(--mk-text)]">{doneText}</p>
        <p className="text-sm text-[var(--mk-muted)]">
          Yanlışlıkla mı bastın? Tercihini istediğin zaman{" "}
          <Link href="/ayarlar" className="underline underline-offset-4">
            Ayarlar
          </Link>
          &apos;dan değiştirebilirsin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void submit()}
        disabled={state === "busy"}
        className="mk-btn-primary inline-flex min-h-11 items-center justify-center px-8 py-3 text-sm font-semibold disabled:opacity-60"
      >
        {state === "busy" ? "Kaydediliyor…" : label}
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-sm text-[#f87171]">
          Kaydedilemedi. Biraz sonra yeniden dene ya da Ayarlar&apos;dan değiştir.
        </p>
      ) : null}
    </div>
  );
}
