"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Flag, MoreHorizontal, UserX } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DUEL_MODERATION_COPY as COPY,
  DUEL_REPORT_NOTE_MAX,
  DUEL_REPORT_REASONS,
  DUEL_REPORT_REASON_LABELS,
  type DuelReportReason,
} from "@/lib/learning/duel-moderation";

/**
 * Düello sıralamasında bir oyuncunun seçenekleri (26 Kasım 2026, mobil 1. adım; App Store 1.2): "Bildir" ve "Engelle".
 * Bildirim herkese açık (misafir dahil), engelleme oturum ister. Kendi satırında çizilmez.
 */
export function DuelPlayerActions({
  code,
  runId,
  name,
  signedIn,
  onBlocked,
}: {
  code: string;
  runId: string;
  name: string;
  signedIn: boolean;
  onBlocked: (runId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<DuelReportReason>("offensive_name");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const formId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && menuRef.current?.contains(event.target as Node)) return;
      if (event instanceof MouseEvent && buttonRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
      if (event instanceof KeyboardEvent) buttonRef.current?.focus();
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [menuOpen]);

  async function sendReport() {
    if (sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/duels/${code}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, reason, note: note.trim() || undefined }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        toast.error(data?.message ?? COPY.failed);
        return;
      }
      toast.success(COPY.reported);
      setReporting(false);
      setNote("");
      buttonRef.current?.focus();
    } catch {
      toast.error(COPY.failed);
    } finally {
      setSending(false);
    }
  }

  async function block() {
    if (blocking) return;
    setBlocking(true);
    try {
      const response = await fetch(`/api/duels/${code}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        toast.error(data?.message ?? COPY.failed);
        return;
      }
      setConfirmBlock(false);
      toast.success(COPY.blocked(name));
      onBlocked(runId);
    } catch {
      toast.error(COPY.failed);
    } finally {
      setBlocking(false);
    }
  }

  return (
    <div className="cp-duel-player-actions">
      <button
        ref={buttonRef}
        type="button"
        className="cp-duel-player-more"
        aria-label={COPY.menuLabel(name)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {menuOpen ? (
        <div ref={menuRef} className="cp-duel-player-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setReporting(true);
            }}
          >
            <Flag className="h-4 w-4" aria-hidden /> {COPY.report}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              if (!signedIn) {
                toast.message(COPY.signInToBlock);
                buttonRef.current?.focus();
                return;
              }
              setConfirmBlock(true);
            }}
          >
            <UserX className="h-4 w-4" aria-hidden /> {COPY.block}
          </button>
        </div>
      ) : null}

      {reporting ? (
        <form
          className="cp-duel-report"
          aria-labelledby={`${formId}-title`}
          onSubmit={(event) => {
            event.preventDefault();
            void sendReport();
          }}
        >
          <p id={`${formId}-title`} className="cp-duel-report-title">
            {COPY.reportTitle}: {name}
          </p>
          <fieldset>
            <legend className="sr-only">{COPY.reportTitle}</legend>
            {DUEL_REPORT_REASONS.map((item) => (
              <label key={item} className="cp-duel-report-reason">
                <input type="radio" name={`${formId}-reason`} value={item} checked={reason === item} onChange={() => setReason(item)} />
                <span>{DUEL_REPORT_REASON_LABELS[item]}</span>
              </label>
            ))}
          </fieldset>
          <textarea
            value={note}
            maxLength={DUEL_REPORT_NOTE_MAX}
            rows={2}
            placeholder={COPY.notePlaceholder}
            aria-label={COPY.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="cp-duel-report-hint">{COPY.reportHint}</p>
          <div className="cp-duel-report-actions">
            <button type="button" className="cp-duel-secondary" onClick={() => setReporting(false)} disabled={sending}>
              {COPY.cancel}
            </button>
            <button type="submit" className="cp-duel-primary" disabled={sending}>
              {COPY.send}
            </button>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`${COPY.block}: ${name}`}
        description={COPY.blockConfirm(name)}
        confirmLabel={COPY.block}
        pending={blocking}
        onConfirm={() => void block()}
        returnFocusRef={buttonRef}
      />
    </div>
  );
}
