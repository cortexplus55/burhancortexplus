"use client";

import { useState } from "react";
import "@/styles/arena.css";

/*
  Paylaşım kabuğu (Faz 4A). Yalnız kabuk: dosyaları çağıran üretir (`getFiles`). `navigator.canShare({ files })` yoksa
  dosya indirilir; bağlantı kopyalanır. Ad ve soru varsayılan KAPALI (ANA-PROMPT §3.11). Faz 10'a kadar hiçbir ekran
  çağırmaz (bekçi test).
*/

export type ShareFormat = "story" | "square" | "link";

const FORMAT_LABEL: Record<ShareFormat, string> = { story: "Hikâye", square: "Kare", link: "Bağlantı" };

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    return false;
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ShareSheet({
  formats,
  getFiles,
  url,
  showName: initialName = false,
  showQuestion: initialQuestion = false,
  onOptionsChange,
}: {
  formats: readonly ShareFormat[];
  getFiles: (format: ShareFormat, options: { showName: boolean; showQuestion: boolean }) => Promise<File[]>;
  url: string;
  showName?: boolean;
  showQuestion?: boolean;
  onOptionsChange?: (options: { showName: boolean; showQuestion: boolean }) => void;
}) {
  const [showName, setShowName] = useState(initialName);
  const [showQuestion, setShowQuestion] = useState(initialQuestion);
  const [copied, setCopied] = useState(false);

  const share = async (format: ShareFormat) => {
    if (format === "link") {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
      return;
    }
    const files = await getFiles(format, { showName, showQuestion });
    if (canShareFiles(files)) {
      await navigator.share({ files, url }).catch(() => undefined);
    } else {
      files.forEach(download);
    }
  };

  const update = (next: { showName: boolean; showQuestion: boolean }) => {
    setShowName(next.showName);
    setShowQuestion(next.showQuestion);
    onOptionsChange?.(next);
  };

  return (
    <div className="cx-share">
      <div className="cx-share-options">
        <label className="cx-t-label-13">
          <input type="checkbox" checked={showName} onChange={(e) => update({ showName: e.target.checked, showQuestion })} /> Adımı göster
        </label>
        <label className="cx-t-label-13">
          <input type="checkbox" checked={showQuestion} onChange={(e) => update({ showName, showQuestion: e.target.checked })} /> Soruyu kartta göster
        </label>
      </div>
      <div className="cx-share-formats">
        {formats.map((format) => (
          <button key={format} type="button" className="cx-glass cx-t-button-s cx-share-format" onClick={() => void share(format)}>
            {format === "link" && copied ? "Kopyalandı" : FORMAT_LABEL[format]}
          </button>
        ))}
      </div>
    </div>
  );
}
