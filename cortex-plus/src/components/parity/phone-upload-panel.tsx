"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";

export function PhoneUploadPanel({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: (doc: { documentId: string; fileName: string }) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    fetch("/api/uploads/phone-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "hazirlik" }),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error ?? "session");
        if (cancelled) return;
        setUrl(payload.uploadUrl as string);
        setQr((payload.qr as string) ?? null);
        const token = payload.token as string;
        poll = setInterval(async () => {
          const statusRes = await fetch(`/api/uploads/phone-session/${token}`);
          const status = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok || cancelled) return;
          if (status.expired) {
            setError(WIZARD_COPY.phoneExpired);
            if (poll) clearInterval(poll);
            return;
          }
          if (status.ready && status.documentId) {
            if (poll) clearInterval(poll);
            onReadyRef.current({
              documentId: status.documentId as string,
              fileName: (status.fileName as string) ?? "Telefon yüklemesi",
            });
          }
        }, 2000);
      })
      .catch(() => {
        if (!cancelled) setError(WIZARD_COPY.phoneFailed);
      });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, []);

  return (
    <div className="apw-phone">
      <p className="apw-drop-hint">{WIZARD_COPY.phoneLead}</p>
      {url && qr ? (
        <div className="apw-phone-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Yükleme QR kodu" width={168} height={168} />
          <button
            type="button"
            className="apw-drop-pick"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(
                () => toast.success("Bağlantı kopyalandı."),
                () => toast.error("Bağlantı kopyalanamadı."),
              )
            }
          >
            {WIZARD_COPY.phoneCopy}
          </button>
        </div>
      ) : (
        <p className="apw-drop-hint">{error ?? WIZARD_COPY.phonePreparing}</p>
      )}
      <button type="button" className="apw-ghost" onClick={onClose}>
        {WIZARD_COPY.phoneClose}
      </button>
    </div>
  );
}
