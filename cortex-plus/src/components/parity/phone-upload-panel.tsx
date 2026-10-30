"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WIZARD_COPY, phoneReceivedLine } from "@/lib/learning/exam-wizard-copy";

type PhoneStatus = {
  expired?: boolean;
  ready?: boolean;
  many?: boolean;
  documentId?: string | null;
  fileName?: string | null;
  documents?: { documentId: string; fileName: string }[];
};

/** Yoklamada yeni gelen dosyalar (görülmemiş olanlar, geliş sırasıyla). Eski sunucu yalnız ilk dosyayı verir. */
export function newPhoneDocuments(status: PhoneStatus, seen: ReadonlySet<string>): { documentId: string; fileName: string }[] {
  const all = Array.isArray(status.documents)
    ? status.documents
    : status.ready && status.documentId
      ? [{ documentId: status.documentId, fileName: status.fileName ?? "Telefon yüklemesi" }]
      : [];
  return all.filter((doc) => doc.documentId && !seen.has(doc.documentId));
}

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
  const [received, setReceived] = useState(0);
  const seen = useRef(new Set<string>());
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
          const status = (await statusRes.json().catch(() => ({}))) as PhoneStatus;
          if (!statusRes.ok || cancelled) return;
          // Çok dosya (31 Ekim 2026): her yeni dosya ayrı bildirilir, yoklama süre dolana ya da pencere kapanana
          // kadar sürer. Eski sunucu (göç yok) tek dosyadan sonra durur.
          for (const doc of newPhoneDocuments(status, seen.current)) {
            seen.current.add(doc.documentId);
            onReadyRef.current(doc);
          }
          setReceived(seen.current.size);
          if (status.expired) {
            if (!seen.current.size) setError(WIZARD_COPY.phoneExpired);
            if (poll) clearInterval(poll);
            return;
          }
          if (!status.many && seen.current.size) {
            if (poll) clearInterval(poll);
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
      {received ? (
        <p className="apw-drop-hint" role="status" aria-live="polite">
          {phoneReceivedLine(received)}
        </p>
      ) : null}
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
