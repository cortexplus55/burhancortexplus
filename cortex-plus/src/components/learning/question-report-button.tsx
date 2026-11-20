"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, Loader2, X } from "lucide-react";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { REPORT_BUTTON, REPORT_REASONS, REPORT_UNAVAILABLE, type ReportReason } from "@/lib/learning/question-report/copy";
import "@/styles/question-report.css";

export type QuestionReportResult = {
  verdict: "valid" | "invalid" | "duplicate" | "pending";
  message: string;
  rewarded: boolean;
  action?: "fix" | "void" | "none";
  question?: PublicQuizQuestion;
  explanation?: string;
  /** Yazılı denemede düzeltilen anahtar (şık metinleri). */
  correctedKey?: string[];
  score?: number;
  total?: number;
};

export type QuestionReportSource = "node" | "mock" | "demo";

/**
 * "🚩 Soruda Hata Bildir" (31 Ekim 2026, Paket J2 #10; Faz 5 §3.1 ile modal, 19 Kasım 2026). Soru kartının sağ
 * üstünde küçük bir düğme; dokununca modal açılır: üç neden ("Cevap anahtarı hatalı", "Soru kökü eksik",
 * "Görsel-formül bozuk"), isteğe bağlı not. Bildirim `question_reports` tablosuna yazılır. Ürün içinde sunucu soruyu
 * kendi kaydından okuyup denetler, sonuç modalda yazar; soru düzeltildiyse `onResolved` ekrana yeni hâlini verir.
 * Tanıtım turunda (`source="demo"`) bildirim ekibin incelemesine düşer (model çağrısı yok).
 */
export function QuestionReportButton({
  source,
  targetId,
  questionRef,
  onResolved,
}: {
  source: QuestionReportSource;
  /** Ürün içinde deneme/test kimliği; tanıtım turunda kullanılmaz. */
  targetId?: string;
  questionRef: string;
  onResolved?: (result: QuestionReportResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuestionReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current;
    dialogRef.current?.querySelector<HTMLElement>("[role='radio'], button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (previous ?? trigger)?.focus?.();
    };
  }, [open, sending]);

  async function send() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(source === "demo" ? "/api/learning/question-report/demo" : "/api/learning/question-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          source === "demo"
            ? { questionRef, reason, note: note.trim() || null }
            : { source, targetId, questionRef, reason, note: note.trim() || null },
        ),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<QuestionReportResult> & { error?: string };
      if (!response.ok || !data.message) {
        setError(data.error || REPORT_UNAVAILABLE);
        return;
      }
      const done = data as QuestionReportResult;
      setResult(done);
      onResolved?.(done);
    } catch {
      setError(REPORT_UNAVAILABLE);
    } finally {
      setSending(false);
    }
  }

  const label = REPORT_BUTTON.replace(/^🚩\s*/, "");

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="cp-qreport-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !sending) setOpen(false);
            }}
          >
            <div ref={dialogRef} className="cp-qreport cp-qreport--modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="qreport-modal">
              <div className="cp-qreport-head">
                <p className="cp-qreport-title" id={titleId}>
                  {REPORT_BUTTON}
                </p>
                <button type="button" className="cp-qreport-close" onClick={() => setOpen(false)} disabled={sending} aria-label="Kapat">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {result ? (
                <>
                  <p className={`cp-qreport-result ${result.verdict === "valid" ? "is-valid" : ""}`} role="status" aria-live="polite">
                    {result.message}
                  </p>
                  <div className="cp-qreport-actions">
                    <button type="button" className="cp-qreport-send" onClick={() => setOpen(false)}>
                      Tamam
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="cp-qreport-reasons" role="radiogroup" aria-label="Hatanın türü">
                    {REPORT_REASONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={reason === item.id}
                        className={`cp-qreport-reason ${reason === item.id ? "is-on" : ""}`}
                        onClick={() => setReason(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <label className="cp-qreport-note">
                    <span>Kısa not (isteğe bağlı)</span>
                    <textarea
                      value={note}
                      maxLength={400}
                      rows={2}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Örn. şıklardan biri yarım görünüyor…"
                    />
                  </label>
                  {error ? (
                    <p className="cp-qreport-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="cp-qreport-actions">
                    <button type="button" className="cp-qreport-cancel" onClick={() => setOpen(false)} disabled={sending}>
                      Vazgeç
                    </button>
                    <button type="button" className="cp-qreport-send" onClick={send} disabled={!reason || sending} aria-busy={sending || undefined}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      <span>{sending ? "Gönderiliyor…" : "Bildir"}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`cp-qreport-trigger ${result ? "is-sent" : ""}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="qreport-trigger"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        <span>{result ? "Bildirildi" : label}</span>
      </button>
      {dialog}
    </>
  );
}
