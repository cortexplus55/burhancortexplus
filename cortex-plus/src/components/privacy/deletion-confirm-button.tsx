"use client";

import { useState } from "react";
import Link from "next/link";
import "@/styles/account-deletion.css";

/** E-postadaki bağlantının açtığı onay: yalnız bu düğme siler (POST). 26 Kasım 2026. */
export function DeletionConfirmButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "deleting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    if (state === "deleting") return;
    setState("deleting");
    setMessage(null);
    try {
      const response = await fetch("/api/hesap-silme/onay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string; error?: string }
        | null;
      if (!response.ok || !body?.ok) {
        setState("error");
        setMessage(body?.error ?? "Silme başlatılamadı. Bağlantını kontrol edip yeniden dene.");
        return;
      }
      setState("done");
      setMessage(
        body.status === "completed"
          ? "Hesabın ve kişisel verilerin silindi."
          : "Silme başladı; kalan adımlar arka planda kendiliğinden tamamlanacak.",
      );
    } catch {
      setState("error");
      setMessage("Silme başlatılamadı. Bağlantını kontrol edip yeniden dene.");
    }
  }

  if (state === "done") {
    return (
      <div className="cx-del">
        <p className="cx-del-status" role="status" data-testid="deletion-confirm-done">
          {message}
        </p>
        <Link href="/" className="cx-del-link">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  return (
    <div className="cx-del">
      {message ? (
        <p className="cx-del-error" role="alert">
          {message}
        </p>
      ) : null}
      <button type="button" className="cx-del-submit" onClick={confirm} disabled={state === "deleting"}>
        {state === "deleting" ? "Siliniyor…" : "Kalıcı olarak sil"}
      </button>
    </div>
  );
}
