"use client";

import { useState } from "react";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";

/**
 * Bağlantıdan materyal (29 Ekim 2026): sunucu sayfayı okur ve belge olarak kaydeder; dönen belge
 * telefon yüklemesiyle aynı yoldan işlenir. Hata metni sunucudan, öğrenci kodu görmez.
 */
export function UrlImportPanel({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: (doc: { documentId: string; fileName: string; sizeBytes: number | null }) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: /^https?:\/\//i.test(value) ? value : `https://${value}` }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        documentId?: string;
        fileName?: string;
        sizeBytes?: number | null;
        error?: string;
      };
      if (!res.ok || !payload.documentId) {
        setError(payload.error ?? "Bağlantı eklenemedi.");
        return;
      }
      onReady({ documentId: payload.documentId, fileName: payload.fileName ?? "Bağlantı", sizeBytes: payload.sizeBytes ?? null });
      onClose();
    } catch {
      setError("Bağlantı hatası. Yeniden dene.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="apw-import" role="group" aria-label={WIZARD_COPY.addUrl}>
      <p className="apw-drop-hint">{WIZARD_COPY.urlLead}</p>
      <input
        className="apw-import-input"
        type="url"
        inputMode="url"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        placeholder="https://…"
        disabled={busy}
      />
      {error ? <p className="apw-drop-hint" role="alert">{error}</p> : null}
      <div className="apw-import-row">
        <button type="button" className="apw-drop-pick" disabled={busy || !url.trim()} onClick={() => void submit()}>
          {busy ? WIZARD_COPY.urlWorking : WIZARD_COPY.urlSubmit}
        </button>
        <button type="button" className="apw-ghost" onClick={onClose} disabled={busy}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}
