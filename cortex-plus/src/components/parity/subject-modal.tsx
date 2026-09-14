"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const PARITY_SUBJECTS = [
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

export function SubjectModal({
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
  const extras = !PARITY_SUBJECTS.includes(value as (typeof PARITY_SUBJECTS)[number])
    ? [value]
    : [];
  const list = [...PARITY_SUBJECTS, ...extras];

  if (!open) return null;

  return (
    <div
      className="cp-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cp-subject-title"
      onClick={onClose}
    >
      <div className="cp-subject-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-hub-head">
          <h2 id="cp-subject-title" className="cp-hub-title">
            Konu seç
          </h2>
          <button
            type="button"
            className="cp-hub-close"
            aria-label="Kapat"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="cp-subject-grid">
          {list.map((subject) => {
            const selected = subject === value;
            return (
              <button
                key={subject}
                type="button"
                className={cn("cp-subject-chip", selected && "cp-subject-chip--on")}
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

        <div className="cp-subject-actions">
          <button
            type="button"
            className="cp-subject-edit"
            onClick={() => setAdding((v) => !v)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Düzenle
          </button>
          {adding ? (
            <form
              className="cp-subject-add-form"
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
              className="cp-subject-add"
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
