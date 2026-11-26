"use client";

import { useState } from "react";
import "@/styles/account-deletion.css";

/**
 * Herkese açık hesap silme formu (26 Kasım 2026, Google Play). E-posta yazılır; hesap varsa adrese onay bağlantısı
 * gider. Cevap her zaman aynı: kayıtlı adresler bu formla sınanamaz.
 */
export function DeletionRequestForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/hesap-silme/talep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        setState("error");
        setError("Çok sık denedin. Birkaç dakika sonra yeniden dene.");
        return;
      }
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) {
        setState("error");
        setError(body?.error ?? "Talep gönderilemedi. Bağlantını kontrol edip yeniden dene.");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
      setError("Talep gönderilemedi. Bağlantını kontrol edip yeniden dene.");
    }
  }

  if (state === "sent") {
    return (
      <p className="cx-del-status" role="status" data-testid="deletion-request-sent">
        Bu adresle bir hesap varsa silme onay bağlantısını gönderdik. E-postandaki bağlantıyı açıp «Kalıcı olarak sil»e
        bastığında hesabın silinir. E-posta birkaç dakika içinde gelmezse gereksiz kutusuna da bak.
      </p>
    );
  }

  return (
    <form className="cx-del-form" onSubmit={submit} noValidate>
      <label className="cx-del-label" htmlFor="deletion-email">
        Hesabının e-posta adresi
      </label>
      <input
        id="deletion-email"
        className="cx-del-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={state === "error" || undefined}
        aria-describedby={error ? "deletion-email-error" : undefined}
      />
      {error ? (
        <p id="deletion-email-error" className="cx-del-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="cx-del-submit" disabled={state === "sending" || !email.trim()}>
        {state === "sending" ? "Gönderiliyor…" : "Silme onay bağlantısı gönder"}
      </button>
    </form>
  );
}
