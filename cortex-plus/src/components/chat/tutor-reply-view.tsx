"use client";

import { useMemo } from "react";
import { Markdown } from "@/components/markdown";
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

/**
 * Sohbet yanıtı: materyal rozeti, katlanır işlem, kaynak çipi, takip önerisi.
 * `####` başlık olarak yapıştırılmaz.
 */
export function TutorReplyView({
  content,
  variant = "parity",
  disabled = false,
  onPrompt,
}: {
  content: string;
  variant?: "default" | "parity";
  disabled?: boolean;
  onPrompt?: (prompt: string) => void;
}) {
  const view = useMemo(
    () => splitTutorChrome(formatSourceSections(content)),
    [content],
  );

  return (
    <>
      {view.badge ? <p className="cp-tutor-badge">{view.badge}</p> : null}
      <TutorBody body={view.body} quote={view.quote} variant={variant} />
      {view.steps ? (
        <details className="cp-tutor-steps">
          <summary>İşlemi göster</summary>
          <Markdown content={view.steps} variant={variant} />
        </details>
      ) : null}
      {view.citations.length ? (
        <div className="cp-tutor-cites">
          {view.citations.map((item) => (
            <a key={`${item.href}-${item.documentName}`} className="cp-tutor-cite" href={item.href}>
              {item.documentName}
              {item.pageNumber != null ? ` · ${item.slide ? "slayt" : "s."} ${item.pageNumber}` : ""}
            </a>
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
