"use client";

import { useEffect, useState } from "react";
import { FileText, Library, X } from "lucide-react";

export type NodeSource = { id: string; name: string; href: string };

/**
 * "N kaynak" — çalışmanın hangi materyallerden üretildiği (Astra, 1 Ekim
 * 2026). Belge yeni sekmede açılır: oturum yarıda kalmasın.
 */
export function NodeSources({ sources }: { sources: NodeSource[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!sources.length) return null;
  return (
    <>
      <button
        type="button"
        className="cp-node-sources"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Library className="h-3.5 w-3.5" aria-hidden />
        {sources.length} kaynak
      </button>
      {open ? (
        <div className="cp-node-sources-back" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="cp-node-sources-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="node-sources-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="node-sources-title">Kaynaklar</h2>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </header>
            <p>Bu çalışma şu materyallerden üretildi.</p>
            <ul>
              {sources.map((source) => (
                <li key={source.id}>
                  <FileText className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{source.name}</span>
                  <a href={source.href} target="_blank" rel="noopener noreferrer">
                    Aç
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
