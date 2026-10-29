"use client";

import { useState } from "react";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";

export const PASTE_MIN_CHARS = 80;

/** Yapıştırılan metin bir `.txt` dosyasıdır; yükleme ve işleme bildiğimiz yoldan (29 Ekim 2026). */
export function pastedTextFile(text: string, name: string): File | null {
  const body = text.replace(/\r\n/g, "\n").trim();
  if (body.length < PASTE_MIN_CHARS) return null;
  const base = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim() || "Yapıştırılan not";
  return new File([body], `${base}.txt`, { type: "text/plain" });
}

export function PasteTextPanel({ onClose, onFile }: { onClose: () => void; onFile: (file: File) => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = text.trim().length;

  return (
    <div className="apw-import" role="group" aria-label={WIZARD_COPY.pasteText}>
      <p className="apw-drop-hint">{WIZARD_COPY.pasteLead}</p>
      <input
        className="apw-import-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={WIZARD_COPY.pasteName}
        maxLength={80}
      />
      <textarea
        className="apw-import-textarea"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        rows={8}
        placeholder="Buraya yapıştır…"
        aria-describedby="apw-paste-count"
      />
      <p id="apw-paste-count" className="apw-drop-hint">
        {count} karakter{count < PASTE_MIN_CHARS ? ` · en az ${PASTE_MIN_CHARS}` : ""}
      </p>
      {error ? <p className="apw-drop-hint" role="alert">{error}</p> : null}
      <div className="apw-import-row">
        <button
          type="button"
          className="apw-drop-pick"
          onClick={() => {
            const file = pastedTextFile(text, name);
            if (!file) {
              setError(WIZARD_COPY.pasteTooShort);
              return;
            }
            onFile(file);
            onClose();
          }}
        >
          {WIZARD_COPY.pasteSubmit}
        </button>
        <button type="button" className="apw-ghost" onClick={onClose}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}
