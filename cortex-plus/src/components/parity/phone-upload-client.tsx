"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import "@/styles/astra-parity-sor.css";

export function PhoneUploadClient({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "used" | "expired" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/uploads/phone/${token}`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload.valid) setStatus("ready");
        else if (payload.reason === "used") setStatus("used");
        else if (payload.reason === "expired") setStatus("expired");
        else setStatus("error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function sendFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/uploads/phone/${token}`, {
        method: "POST",
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload.error === "expired") setStatus("expired");
        else if (payload.error === "used") setStatus("used");
        else setStatus("error");
        return;
      }
      setDoneName(payload.fileName ?? file.name);
      setStatus("used");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-phone-page">
      <div className="ap-phone-card">
        <p className="ap-phone-brand">cortex Plus</p>
        <h1>Ödev resmini yükle</h1>
        {status === "loading" ? <p>Bağlantı kontrol ediliyor…</p> : null}
        {status === "expired" ? (
          <p>Bu kodun süresi doldu. Bilgisayardan yeniden aç.</p>
        ) : null}
        {status === "error" ? <p>Yükleme bağlantısı geçersiz.</p> : null}
        {status === "used" ? (
          <p>
            {doneName
              ? `${doneName} gönderildi. Bilgisayarındaki sohbette görünecek.`
              : "Bu kod zaten kullanıldı."}
          </p>
        ) : null}
        {status === "ready" ? (
          <>
            <p>Kameradan veya galeriden görseli seç; masaüstündeki sohbete düşer.</p>
            <button
              type="button"
              className="ap-upload-pick"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-2 inline h-4 w-4" aria-hidden />
              {busy ? "Yükleniyor…" : "Dosya seç"}
            </button>
          </>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void sendFile(file);
          }}
        />
      </div>
    </div>
  );
}
