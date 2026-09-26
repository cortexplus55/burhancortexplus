"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileText,
  History,
  Lightbulb,
  XCircle,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MathText } from "@/components/learning/math-text";
import { formatSourceSections } from "@/lib/ai/source-sections";
import { splitTutorChrome, type ReplyQuote } from "@/lib/learning/tutor-reply";

function TutorBody({
  body,
  quote,
  variant,
}: {
  body: string;
  quote: ReplyQuote | null;
  variant: "default" | "parity";
}) {
  if (!body && !quote) return null;
  const parts = body.split("[[QUOTE]]");
  if (!quote || parts.length < 2) {
    return body ? <Markdown content={body} variant={variant} /> : null;
  }
  const [before, after] = parts;
  return (
    <>
      {before?.trim() ? <Markdown content={before.trim()} variant={variant} /> : null}
      <blockquote className="cp-tutor-quote">
        <p>{quote.text}</p>
        <footer>— {quote.source}</footer>
      </blockquote>
      {after?.trim() ? <Markdown content={after.trim()} variant={variant} /> : null}
    </>
  );
}

function VerdictChip({ label, verdict }: { label: string; verdict: "dogru" | "kismen" | "yanlis" }) {
  const Icon = verdict === "dogru" ? CheckCircle2 : verdict === "kismen" ? CircleDot : XCircle;
  return (
    <p className={`cp-tutor-verdict cp-tutor-verdict--${verdict}`} role="status">
      <Icon size={16} aria-hidden />
      <span>{label}</span>
    </p>
  );
}

/**
 * Sohbet yanıtı: benzetme, kural, sıra sende, hüküm çipi, katlanır işlem,
 * kaynak / geçmiş çipi, takip önerisi.
 */
export function TutorReplyView({
  content,
  variant = "parity",
  disabled = false,
  onPrompt,
  error,
  onRetry,
}: {
  content: string;
  variant?: "default" | "parity";
  disabled?: boolean;
  onPrompt?: (prompt: string) => void;
  error?: boolean;
  onRetry?: () => void;
}) {
  const checkRef = useRef<HTMLDivElement | null>(null);
  const view = useMemo(
    () => splitTutorChrome(formatSourceSections(content)),
    [content],
  );

  useEffect(() => {
    if (!view.check || typeof window === "undefined") return;
    // Mobilde klavye aniden açılmasın.
    if (window.matchMedia("(max-width: 640px)").matches) return;
    const composer = document.querySelector<HTMLTextAreaElement>(
      "textarea[name='message'], textarea.cp-exam-input, textarea.cp-sor-input",
    );
    composer?.focus();
  }, [view.check]);

  if (error) {
    return (
      <div className="cp-tutor-error" role="alert">
        <AlertCircle size={18} aria-hidden />
        <p>Yanıt şu anda oluşturulamadı.</p>
        {onRetry ? (
          <button type="button" className="cp-tutor-error-retry" onClick={onRetry}>
            Yeniden dene
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {view.badge ? <p className="cp-tutor-badge">{view.badge}</p> : null}
      {view.verdict ? (
        <VerdictChip label={view.verdict.label} verdict={view.verdict.verdict} />
      ) : null}
      {view.verifying ? (
        <div className="cp-tutor-verifying" aria-live="polite">
          <div className="pm-skeleton" style={{ height: 12, width: "92%" }} />
          <div className="pm-skeleton" style={{ height: 12, width: "70%", marginTop: 8 }} />
          <p className="cp-tutor-verifying-label">Hesaplar doğrulanıyor…</p>
        </div>
      ) : null}
      {view.analogy ? (
        <aside className="cp-tutor-analogy">
          <p className="cp-tutor-analogy-kicker">
            <Lightbulb size={16} aria-hidden />
            Benzetme
          </p>
          <p className="cp-tutor-analogy-body">{view.analogy}</p>
        </aside>
      ) : null}
      {view.rule ? (
        <div className="cp-tutor-rule">
          <MathText text={view.rule} />
        </div>
      ) : null}
      {view.example ? (
        <section className="cp-tutor-example">
          <p className="cp-tutor-example-title">Notlarından bir örnek</p>
          <Markdown content={view.example} variant={variant} />
        </section>
      ) : null}
      <TutorBody body={view.body} quote={view.quote} variant={variant} />
      {view.check ? (
        <div className="cp-tutor-check" ref={checkRef}>
          <p className="cp-tutor-check-kicker">Sıra sende</p>
          <p className="cp-tutor-check-q">{view.check}</p>
          <p className="cp-tutor-check-hint">Cevabını aşağıya yaz ya da söyle.</p>
        </div>
      ) : null}
      {view.steps ? (
        <details className="cp-tutor-steps">
          <summary>
            <ChevronDown size={16} aria-hidden />
            Adımları göster
          </summary>
          <Markdown content={view.steps} variant={variant} />
        </details>
      ) : null}
      {view.followUp ? <p className="cp-tutor-followup">{view.followUp}</p> : null}
      {(view.citations.length > 0 || view.historyCitations.length > 0) ? (
        <div className="cp-tutor-cites">
          {view.citations.map((item) => {
            const raw = `${item.documentName}${item.pageNumber != null ? ` · ${item.slide ? "slayt" : "s."} ${item.pageNumber}` : ""}`;
            const label = raw.length > 24 ? `${raw.slice(0, 23)}…` : raw;
            return (
              <a
                key={`${item.href}-${item.documentName}`}
                className="cp-tutor-cite"
                href={item.href}
                title={raw}
              >
                <FileText size={14} aria-hidden />
                {label}
              </a>
            );
          })}
          {view.historyCitations.map((item) => (
            <span key={item.id} className="cp-tutor-cite cp-tutor-cite--history" title={item.label}>
              <History size={14} aria-hidden />
              {item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label}
            </span>
          ))}
        </div>
      ) : null}
      {view.scope ? (
        <button
          type="button"
          className="cp-tutor-scope"
          disabled={disabled}
          onClick={() => onPrompt?.(view.scope?.prompt ?? "")}
        >
          {view.scope.label}
        </button>
      ) : null}
      {view.chips.length ? (
        <div className="cp-tutor-chips" role="group" aria-label="Devam önerileri">
          {view.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="cp-tutor-chip"
              disabled={disabled}
              onClick={() => onPrompt?.(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
