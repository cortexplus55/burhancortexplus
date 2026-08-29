"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone, Upload, X } from "lucide-react";
import { qrImageUrl } from "@/lib/app-url";

export function AstraUploadModal({
  open,
  onClose,
  onPick,
  onRemote,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
  onRemote?: (doc: { documentId: string; fileName: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const onRemoteRef = useRef(onRemote);
  const [over, setOver] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  onCloseRef.current = onClose;
  onRemoteRef.current = onRemote;

  useEffect(() => {
    if (!open) {
      setUploadUrl(null);
      setPhoneError(null);
      return;
    }

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    fetch("/api/uploads/phone-session", { method: "POST" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error ?? "session");
        if (cancelled) return;
        setUploadUrl(payload.uploadUrl as string);
        const token = payload.token as string;
        poll = setInterval(async () => {
          const statusRes = await fetch(`/api/uploads/phone-session/${token}`);
          const status = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok) return;
          if (status.expired) {
            setPhoneError("Kodun süresi doldu. Kapatıp yeniden aç.");
            if (poll) clearInterval(poll);
            return;
          }
          if (status.ready && status.documentId) {
            onRemoteRef.current?.({
              documentId: status.documentId as string,
              fileName: (status.fileName as string) ?? "Telefon yüklemesi",
            });
            if (poll) clearInterval(poll);
            onCloseRef.current();
          }
        }, 2000);
      })
      .catch(() => {
        if (!cancelled) {
          setPhoneError("QR şu an oluşturulamadı. Dosyayı buradan seçebilirsin.");
        }
      });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, [open]);

  if (!open) return null;

  function takeFile(file: File | undefined) {
    if (!file) return;
    onPick(file);
    onClose();
  }

  return (
    <div
      className="ap-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ap-upload-title"
      onClick={onClose}
    >
      <div className="ap-upload-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-hub-head">
          <h2 id="ap-upload-title" className="ap-hub-title">
            Ödev resmini yükle
          </h2>
          <button
            type="button"
            className="ap-hub-close"
            aria-label="Kapat"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={over ? "ap-upload-drop ap-upload-drop--over" : "ap-upload-drop"}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            takeFile(e.dataTransfer.files?.[0]);
          }}
        >
          <Upload className="h-8 w-8 opacity-70" aria-hidden />
          <p>Dosyalarını buraya bırak</p>
          <p className="ap-upload-hint">Görseller, PDF</p>
          <button
            type="button"
            className="ap-upload-pick"
            onClick={() => inputRef.current?.click()}
          >
            Dosya seç
          </button>
        </div>

        <div className="ap-upload-or">
          <span>veya</span>
        </div>

        <div className="ap-upload-phone">
          <Smartphone className="h-8 w-8 shrink-0 opacity-70" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Telefonundan yükle</p>
            <p className="ap-upload-hint">
              QR’ı telefonunla tara; kamera veya galeriden görseli gönder.
            </p>
            {uploadUrl ? (
              <div className="ap-upload-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImageUrl(uploadUrl, 168)} alt="Yükleme QR kodu" />
                <button
                  type="button"
                  className="ap-copy-link"
                  onClick={() => void navigator.clipboard.writeText(uploadUrl)}
                >
                  Bağlantıyı kopyala
                </button>
              </div>
            ) : (
              <p className="ap-upload-hint">
                {phoneError ?? "QR hazırlanıyor…"}
              </p>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,application/pdf"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
