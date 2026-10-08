"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Hazırlık Ayarları'nın üstü (Astra, 1 Ekim 2026): adı ve hedef puanı yerinde
 * düzenle, hazırlığı sil. Plan ayarları (tarih, süre, günler) aşağıda ayrı.
 */
export function PrepBasicsPanel({
  prepId,
  title,
  targetScore,
}: {
  prepId: string;
  title: string;
  targetScore: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<"title" | "target" | null>(null);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftTarget, setDraftTarget] = useState(targetScore != null ? String(targetScore) : "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(body: { title?: string; targetScore?: number | null }) {
    setSaving(true);
    try {
      const res = await fetch("/api/learning/exam-prep/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, ...body }),
      });
      if (!res.ok) throw new Error();
      setEditing(null);
      toast.success("Kaydedildi.");
      router.refresh();
    } catch {
      toast.error("Kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch("/api/learning/exam-prep/details", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Hazırlık silindi.");
      router.push("/deneme-sinavlari");
      router.refresh();
    } catch {
      toast.error("Silinemedi. Lütfen tekrar dene.");
      setDeleting(false);
    }
  }

  const cleanTitle = draftTitle.trim();
  const targetNumber = draftTarget.trim() ? Number(draftTarget) : null;
  const targetValid =
    targetNumber === null || (Number.isInteger(targetNumber) && targetNumber >= 1 && targetNumber <= 100);

  return (
    <div className="cp-prep-basics">
      <div className="cp-prep-basics-row">
        <span className="cp-prep-basics-label">Hazırlık adı</span>
        {editing === "title" ? (
          <form
            className="cp-prep-basics-edit"
            onSubmit={(event) => {
              event.preventDefault();
              if (cleanTitle) void save({ title: cleanTitle });
            }}
          >
            <input
              value={draftTitle}
              maxLength={120}
              aria-label="Hazırlık adı"
              onChange={(event) => setDraftTitle(event.target.value)}
              autoFocus
            />
            <button type="submit" disabled={saving || !cleanTitle}>
              Kaydet
            </button>
            <button type="button" className="is-ghost" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
          </form>
        ) : (
          <>
            <strong>{title}</strong>
            <button type="button" className="cp-prep-basics-link" onClick={() => setEditing("title")}>
              Düzenle
            </button>
          </>
        )}
      </div>

      <div className="cp-prep-basics-row">
        <span className="cp-prep-basics-label">Hedef puan</span>
        {editing === "target" ? (
          <form
            className="cp-prep-basics-edit"
            onSubmit={(event) => {
              event.preventDefault();
              if (targetValid) void save({ targetScore: targetNumber });
            }}
          >
            <input
              value={draftTarget}
              inputMode="numeric"
              aria-label="Hedef puan (1–100)"
              placeholder="1–100"
              onChange={(event) => setDraftTarget(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              autoFocus
            />
            <button type="submit" disabled={saving || !targetValid}>
              Kaydet
            </button>
            <button type="button" className="is-ghost" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
          </form>
        ) : (
          <>
            <strong>{targetScore != null ? `%${targetScore}` : "Belirlenmedi"}</strong>
            <button type="button" className="cp-prep-basics-link" onClick={() => setEditing("target")}>
              Düzenle
            </button>
          </>
        )}
      </div>

      <div className="cp-prep-basics-danger">
        {confirmDelete ? (
          <div role="alertdialog" aria-labelledby="prep-delete-title" className="cp-prep-basics-confirm">
            <p id="prep-delete-title">
              <strong>Hazırlık silinsin mi?</strong> Yol, konular, dersler ve yazılı denemeler kalıcı
              olarak silinir. Yüklediğin belgeler Belgeler&apos;de kalır.
            </p>
            <div>
              <button type="button" className="is-danger" disabled={deleting} onClick={() => void remove()}>
                {deleting ? "Siliniyor…" : "Sil"}
              </button>
              <button type="button" className="is-ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="cp-prep-basics-delete" onClick={() => setConfirmDelete(true)}>
            Hazırlığı sil
          </button>
        )}
      </div>
    </div>
  );
}
