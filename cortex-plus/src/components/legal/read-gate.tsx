"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { LegalDocBody } from "@/components/legal/legal-doc-body";
import { READABLE_DOCS, type ReadableDoc, type ReadableDocId } from "@/lib/legal/legal-docs";
import type { ReadEvidence } from "@/lib/legal/consent-evidence";
import { cn } from "@/lib/utils";
import "@/styles/legal-consent.css";

/*
  Okumadan işaretlenemeyen onay kutusu (7 Kasım 2026, ürün sahibinin isteği): "KVKK'yı görünür yap, içine girmeden
  kutucuğu işaretleyemesin; mecbur içeriği okumak için açsın, kutucuğu işaretlesin, öyle devam etsin."

  Kutuya ya da metnin adına dokunmak metni bir pencerede açar. "Okudum, onaylıyorum" düğmesi metnin sonu görünene
  kadar kapalıdır; onaylanınca kutu işaretlenir ve kanıt (sürüm, açılış ve onay anı, sonuna kadar kaydırıldı) çağırana
  döner, sunucu onu `consent_records.evidence`e yazar. Öğrenci kutuyu kaldırıp yeniden işaretlerse metin yeniden
  açılmaz: okumuştur.

  `remembered`: öğrenci bu sürümü daha önce sonuna kadar okumuş (ör. bir önceki satın almada). Kutu yine işaretlenir
  ama metin zorla açılmaz; isterse adına dokunup yeniden okur.
*/

export type ReadGateChange = { checked: boolean; evidence: ReadEvidence | null };

export function ReadGate({
  docId,
  linkText,
  before,
  after,
  ariaLabel,
  checked,
  remembered = false,
  onChange,
  className,
  checkboxClassName,
}: {
  docId: ReadableDocId;
  /** Kutudaki bağlantı adı; dokununca metin açılır. Verilmezse metnin başlığı. */
  linkText?: string;
  before?: ReactNode;
  after: ReactNode;
  /** Kutunun tam adı (ekran okuyucu ve testler bunu okur). */
  ariaLabel: string;
  checked: boolean;
  remembered?: boolean;
  onChange: (change: ReadGateChange) => void;
  className?: string;
  checkboxClassName?: string;
}) {
  const doc = READABLE_DOCS[docId];
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<ReadEvidence | null>(null);
  const openedAt = useRef<string | null>(null);
  const hintId = useId();
  const read = Boolean(evidence) || remembered;

  function openReader() {
    if (!openedAt.current) openedAt.current = new Date().toISOString();
    setOpen(true);
  }

  function confirm() {
    const next: ReadEvidence = {
      version: doc.version,
      openedAt: openedAt.current ?? new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      scrolledToEnd: true,
    };
    setEvidence(next);
    setOpen(false);
    onChange({ checked: true, evidence: next });
  }

  function toggle(next: boolean) {
    if (next && !read) {
      openReader();
      return;
    }
    onChange({ checked: next, evidence });
  }

  return (
    <div className={cn("cp-legal-row", className)} data-doc={docId}>
      <Checkbox
        aria-label={ariaLabel}
        aria-describedby={hintId}
        className={cn("mt-0.5 size-5 border-[var(--c-text-subtle)]", checkboxClassName)}
        checked={checked}
        onCheckedChange={(value) => toggle(value === true)}
      />
      <span className="cp-legal-row-text">
        <span
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) return;
            toggle(!checked);
          }}
        >
          {before}
          {/*
            Gerçek bağlantı: satır içinde doğal kırılır (düğme satır içi blok olur ve sihirbazın 44 px kuralıyla
            satırı şişiriyordu) ve betik çalışmasa metnin sayfasını açar. Dokununca sayfaya gitmez, pencere açılır.
          */}
          <a
            href={doc.href}
            className="cp-legal-link"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openReader();
            }}
          >
            {linkText ?? doc.title}
          </a>
          {after}
        </span>
        <span id={hintId} className="cp-legal-hint" data-read={read}>
          {read
            ? "✓ Okundu"
            : "Kutuyu işaretlemek için önce metni aç ve sonuna kadar oku."}
        </span>
      </span>
      <ReaderDialog doc={doc} open={open} onClose={() => setOpen(false)} onConfirm={confirm} />
    </div>
  );
}

/**
 * Metnin okunduğu pencere. "Okudum, onaylıyorum" yalnız metnin sonu (görünmez bir işaret) kaydırma alanında
 * görününce açılır. Metin kısaysa ve kaydırma gerekmiyorsa hemen açıktır: öğrenci metni zaten görüyor.
 */
export function ReaderDialog({
  doc,
  open,
  onClose,
  onConfirm,
  confirmLabel = "Okudum, onaylıyorum",
}: {
  doc: ReadableDoc;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  const attachBody = useCallback((node: HTMLDivElement | null) => {
    bodyRef.current = node;
    setBody(node);
  }, []);

  useEffect(() => {
    if (!open || !body || !sentinel || reachedEnd) return;
    const nearEnd = () => body.scrollHeight - body.scrollTop - body.clientHeight <= 24;
    if (typeof IntersectionObserver === "undefined") {
      if (nearEnd()) {
        setReachedEnd(true);
        return;
      }
      const onScroll = () => {
        if (nearEnd()) setReachedEnd(true);
      };
      body.addEventListener("scroll", onScroll, { passive: true });
      return () => body.removeEventListener("scroll", onScroll);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReachedEnd(true);
      },
      { root: body, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, body, sentinel, reachedEnd]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="cp-legal-backdrop" />
        <Dialog.Popup className="cp-legal-dialog" initialFocus={bodyRef} data-doc={doc.id}>
          <div className="cp-legal-dialog-head">
            <div className="min-w-0">
              <Dialog.Title className="cp-legal-dialog-title">{doc.title}</Dialog.Title>
              <Dialog.Description className="cp-legal-dialog-meta">
                Sürüm {doc.version} ·{" "}
                {doc.parts.length > 1 ? (
                  doc.parts.map((part, index) =>
                    part.href ? (
                      <span key={part.href}>
                        {index > 0 ? " · " : null}
                        <ExternalAnchor href={part.href} className="underline underline-offset-2">
                          {part.title}
                        </ExternalAnchor>
                      </span>
                    ) : null,
                  )
                ) : (
                  <ExternalAnchor href={doc.href} className="underline underline-offset-2">
                    Ayrı sayfada aç
                  </ExternalAnchor>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close className="cp-legal-close" aria-label="Kapat">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div
            ref={attachBody}
            className="cp-legal-dialog-body"
            tabIndex={0}
            role="document"
            aria-label={`${doc.title} metni`}
          >
            <LegalDocBody doc={doc} />
            <div ref={setSentinel} className="cp-legal-sentinel" aria-hidden />
          </div>
          <div className="cp-legal-dialog-foot">
            <p className="cp-legal-progress" data-done={reachedEnd} aria-live="polite">
              {reachedEnd ? "Metnin sonuna geldin." : "Onaylamak için metni sonuna kadar kaydır."}
            </p>
            <div className="cp-legal-actions">
              <Dialog.Close className="cp-legal-btn">Kapat</Dialog.Close>
              <button
                type="button"
                className="cp-legal-btn"
                data-primary="true"
                disabled={!reachedEnd}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
