"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const ASTRA_SUBJECTS = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Bilişim",
  "İngilizce",
  "Almanca",
  "İspanyolca",
  "Fransızca",
  "Biyoloji",
  "Coğrafya",
  "Tarih",
  "Ekonomi",
  "Felsefe",
  "Psikoloji",
  "Türkçe",
  "Edebiyat",
] as const;

export function AstraSubjectModal({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: string;
  onClose: () => void;
  onSelect: (subject: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const extras = !ASTRA_SUBJECTS.includes(value as (typeof ASTRA_SUBJECTS)[number])
    ? [value]
    : [];
  const list = [...ASTRA_SUBJECTS, ...extras];

  if (!open) return null;

  return (
    <div
      className="ap-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ap-subject-title"
      onClick={onClose}
    >
      <div className="ap-subject-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-hub-head">
          <h2 id="ap-subject-title" className="ap-hub-title">
            Konu seç
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

        <div className="ap-subject-grid">
          {list.map((subject) => {
            const selected = subject === value;
            return (
              <button
                key={subject}
                type="button"
                className={cn("ap-subject-chip", selected && "ap-subject-chip--on")}
                onClick={() => {
                  onSelect(subject);
                  onClose();
                }}
              >
                {subject}
                {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            );
          })}
        </div>

        <div className="ap-subject-actions">
          <button
            type="button"
            className="ap-subject-edit"
            onClick={() => setAdding((v) => !v)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Düzenle
          </button>
          {adding ? (
            <form
              className="ap-subject-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                const next = custom.trim();
                if (!next) return;
                onSelect(next);
                setCustom("");
                setAdding(false);
                onClose();
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Ders adı"
                aria-label="Yeni ders"
                autoFocus
              />
              <button type="submit">Ekle</button>
            </form>
          ) : (
            <button
              type="button"
              className="ap-subject-add"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Ekle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
