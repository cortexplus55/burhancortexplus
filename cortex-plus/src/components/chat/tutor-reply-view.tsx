"use client";

import { useMemo } from "react";
import { Markdown } from "@/components/markdown";
import { formatSourceSections } from "@/lib/ai/source-sections";
import { splitTutorChrome } from "@/lib/learning/tutor-reply";

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
      {view.body ? <Markdown content={view.body} variant={variant} /> : null}
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
