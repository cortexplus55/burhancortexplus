"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { REPORT_BUTTON, REPORT_REASONS, REPORT_UNAVAILABLE, type ReportReason } from "@/lib/learning/question-report/copy";
import "@/styles/question-report.css";

export type QuestionReportResult = {
  verdict: "valid" | "invalid" | "duplicate";
  message: string;
  rewarded: boolean;
  action?: "fix" | "void" | "none";
  question?: PublicQuizQuestion;
  score?: number;
  total?: number;
};

/**
 * "🚩 Soruda hata bildir" (31 Ekim 2026, Paket J2 #10). Sorunun köşesinde küçük bir düğme; açılınca neden seçilir,
 * isteğe bağlı not yazılır. Sunucu soruyu kendi kaydından okuyup denetler; sonuç aynı kutuda yazar. Soru düzeltildiyse
 * `onResolved` ekrana yeni hâlini verir.
 */
export function QuestionReportButton({
  source,
  targetId,
  questionRef,
  onResolved,
}: {
  source: "node" | "mock";
  targetId: string;
  questionRef: string;
  onResolved?: (result: QuestionReportResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<QuestionReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/learning/question-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, targetId, questionRef, reason, note: note.trim() || null }),
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

  if (result) {
    return (
      <p className={`cp-qreport-result ${result.verdict === "valid" ? "is-valid" : ""}`} role="status" aria-live="polite">
        {result.message}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="cp-qreport-trigger" onClick={() => setOpen(true)}>
        <Flag className="h-3.5 w-3.5" aria-hidden />
        <span>{REPORT_BUTTON.replace(/^🚩\s*/, "")}</span>
      </button>
    );
  }

  return (
    <div className="cp-qreport" role="group" aria-label="Soruda hata bildir">
      <p className="cp-qreport-title">{REPORT_BUTTON}</p>
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
          placeholder="Örn. doğru cevap C olmalı, çünkü…"
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
          <span>{sending ? "Kontrol ediliyor…" : "Bildir"}</span>
        </button>
      </div>
    </div>
  );
}
