"use client";

import { useRef, useState } from "react";
import { Smartphone, Upload, X } from "lucide-react";

export function AstraUploadModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

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
          <p className="ap-upload-hint">Görseller, PDF, Word, PowerPoint</p>
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
          <div>
            <p className="font-semibold">Telefonundan yükle</p>
            <p className="ap-upload-hint">
              Aynı hesaba telefondan gir; kamera veya galeriden görseli buraya
              ekleyebilirsin.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,application/pdf"
          onChange={(e) => {
            takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
