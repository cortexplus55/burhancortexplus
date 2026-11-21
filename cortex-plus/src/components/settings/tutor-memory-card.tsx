"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  parseTutorMemoryNotes,
  TUTOR_MEMORY_COPY as COPY,
  TUTOR_MEMORY_ENDPOINT,
  TUTOR_NOTE_KIND_LABEL,
  type TutorMemoryNoteView,
} from "@/lib/tutor/memory-notes-view";
import "@/styles/tutor-memory-card.css";

type State =
  | { kind: "loading" }
  /** Bayrak kapalı ya da oturum yok: bölüm hiç çizilmez. */
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "ready"; notes: TutorMemoryNoteView[] };

/**
 * Ayarlar · "Öğretmenin seni nasıl tanıyor" (öğretmen v3, teacher.v2, 21 Kasım 2026). Sayfanın sunucu sorgu bütçesine
 * girmez: notlar bileşen açılınca uçtan istenir; uç 404 dönerse (bayrak kapalı) bölüm görünmez. Her not tek tek
 * silinir; "Hepsini sil" onay penceresiyle. Notların içeriğini öğretmen yazar; burada yalnız gösterilir ve silinir.
 */
export function TutorMemoryCard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const clearRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(TUTOR_MEMORY_ENDPOINT, { cache: "no-store" });
      if (response.status === 404 || response.status === 401) {
        setState({ kind: "hidden" });
        return;
      }
      if (!response.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", notes: parseTutorMemoryNotes(await response.json().catch(() => null)) });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(body: { id: string } | { all: true }): Promise<boolean> {
    try {
      const response = await fetch(TUTOR_MEMORY_ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function removeOne(note: TutorMemoryNoteView) {
    if (busyId || state.kind !== "ready") return;
    const before = state.notes;
    setBusyId(note.id);
    setState({ kind: "ready", notes: before.filter((item) => item.id !== note.id) });
    const ok = await remove({ id: note.id });
    setBusyId(null);
    if (ok) {
      toast.success(COPY.deletedOne);
    } else {
      setState({ kind: "ready", notes: before });
      toast.error(COPY.deleteFailed);
    }
  }

  async function removeAll() {
    if (clearing) return;
    setClearing(true);
    const ok = await remove({ all: true });
    setClearing(false);
    if (ok) {
      setConfirmOpen(false);
      setState({ kind: "ready", notes: [] });
      toast.success(COPY.deletedAll);
    } else {
      toast.error(COPY.deleteFailed);
    }
  }

  if (state.kind === "loading" || state.kind === "hidden") return null;

  return (
    <section className="cp-set-group cp-tmem" aria-labelledby="cp-tmem-title">
      <h2 id="cp-tmem-title" className="cp-set-group-title">
        {COPY.title}
      </h2>
      <p className="cp-set-group-desc">{COPY.description}</p>
      <div className="cp-set-group-body">
        {state.kind === "error" ? (
          <div className="cp-tmem-state" role="status">
            <p>{COPY.loadError}</p>
            <button type="button" className="cp-set-inline-btn cp-tmem-retry" onClick={() => void load()}>
              {COPY.retry}
            </button>
          </div>
        ) : state.notes.length === 0 ? (
          <div className="cp-tmem-state">
            <strong>{COPY.emptyTitle}</strong>
            <p>{COPY.emptyText}</p>
          </div>
        ) : (
          <>
            <ul className="cp-set-rows cp-tmem-list">
              {state.notes.map((note) => (
                <li key={note.id} className="cp-tmem-row">
                  <span className="cp-tmem-text">
                    <span className="cp-tmem-kind">{TUTOR_NOTE_KIND_LABEL[note.kind]}</span>
                    <span className="cp-tmem-note">{note.note}</span>
                  </span>
                  <button
                    type="button"
                    className="cp-tmem-delete"
                    aria-label={`${COPY.deleteOne}: ${note.note}`}
                    title={COPY.deleteOne}
                    disabled={busyId === note.id}
                    onClick={() => void removeOne(note)}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              ref={clearRef}
              type="button"
              className="cp-set-inline-btn cp-tmem-clear"
              onClick={() => setConfirmOpen(true)}
            >
              {COPY.deleteAll}
            </button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={COPY.confirmTitle}
        description={COPY.confirmText}
        confirmLabel={COPY.confirmLabel}
        pendingLabel={COPY.pendingLabel}
        pending={clearing}
        onConfirm={() => void removeAll()}
        returnFocusRef={clearRef}
      />
    </section>
  );
}
