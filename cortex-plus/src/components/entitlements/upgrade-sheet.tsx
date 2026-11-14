"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDismiss } from "@/lib/ui/use-dismiss";
import type { SheetContent } from "@/lib/entitlements/sheet-copy";
import "@/styles/entitlements.css";

/*
  Yükseltme penceresi (Faz 3B). Masaüstünde ortada 480 px, telefonda alttan tam genişlik (güvenli alan, hedefler
  ≥ 44 px). Odak tuzağı, Esc, dışarı tıklama; kapanınca odak tetikleyiciye (çağıran döndürür). Tek `brand`; ikinci
  seçenek `weak`. Metin ve sayılar `sheetContent`'ten.
*/

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function UpgradeSheet({
  content,
  onClose,
  onChoose,
}: {
  content: SheetContent;
  onClose: () => void;
  onChoose?: (target: "plus" | "week" | "sigma") => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDismiss(true, onClose, { initialFocus: closeRef });

  // Odak tuzağı: Tab pencerenin içinde döner.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { primary, secondary } = content;
  return (
    <div className="cx-ent-scrim" onClick={onClose} data-reason={content.reason}>
      <div
        ref={panelRef}
        className="cx-ent-sheet cx-surface-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="cx-ent-close cx-glass" aria-label="Kapat" onClick={onClose}>
          <X aria-hidden />
        </button>
        <h2 id={titleId} className="cx-t-title-s cx-ent-title">
          {content.title}
        </h2>
        {content.figure ? <p className="cx-t-num-l cx-ent-figure">{content.figure}</p> : null}
        {content.body.map((line) => (
          <p key={line} className="cx-t-body-14 cx-ent-body">
            {line}
          </p>
        ))}
        {content.mini ? <p className="cx-t-meta-s cx-ent-mini">{content.mini}</p> : null}
        {content.meter || content.reset ? (
          <div className="cx-ent-meter">
            {content.meter ? <span className="cx-t-meta-s">{content.meter}</span> : null}
            {content.reset ? <span className="cx-t-meta-s">{content.reset}</span> : null}
          </div>
        ) : null}
        {content.options.length ? (
          <ul className="cx-ent-options">
            {content.options.map((option) => (
              <li key={option.plan} className="cx-ent-option" data-plan={option.plan}>
                <span className="cx-t-label-15 cx-ent-option-title">
                  {option.title}
                  {option.recommended ? <span className="cx-t-meta-xs cx-ent-reco">Önerilen</span> : null}
                </span>
                {option.note ? <span className="cx-t-body-12 cx-ent-option-note">{option.note}</span> : null}
                {option.price ? <span className="cx-t-label-15 cx-ent-option-price">{option.price}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="cx-ent-actions">
          <Link
            href={primary.href}
            className="cx-ent-primary cx-brand cx-t-button-l"
            onClick={() => onChoose?.(primary.plan)}
          >
            {primary.label}
          </Link>
          {secondary ? (
            secondary.href ? (
              <Link
                href={secondary.href}
                className="cx-ent-secondary cx-weak cx-t-button-s"
                onClick={() => (secondary.plan ? onChoose?.(secondary.plan) : undefined)}
              >
                {secondary.label}
              </Link>
            ) : (
              <button type="button" className="cx-ent-secondary cx-weak cx-t-button-s" onClick={onClose}>
                {secondary.label}
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
