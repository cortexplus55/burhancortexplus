"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Copy, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { CLASS_SHARE_LABEL, CLASS_SHARE_NOTE, CLASS_SHARE_REWARD_NOTE } from "@/lib/learning/class-share";
import { PREP_SHARE_NOTE } from "@/lib/learning/prep-share";
import "@/styles/confirm-dialog.css";
import "@/styles/class-share.css";

export const CLASS_SHARE_URL = "/api/learning/exam-prep/share-code";

type ShareLink = { mode: "clone" | "invite"; url: string; whatsappHref: string };

/**
 * "📲 Sınıfla Paylaş" (Faz 7, 20 Kasım 2026): hazırlık sayfasının üst simgelerinde tek paylaşım girişi. Basınca pencere
 * hemen açılır, bağlantı sunucudan gelir (kod yoksa açılır, varsa aynısı; sahiplik ve hız sınırı sunucuda). Bağlantı
 * mutlak (`/davet/<kod>`); göç yokken bugünkü imzalı sınıf daveti (`mode: "invite"`, ödülsüz). WhatsApp ayrı bir
 * dokunuşla açılır (açılır pencere engeline takılmaz); kopyalama yedeği ve bağlantının kendisi pencerede durur.
 */
export function ClassShareButton({ prepId }: { prepId: string }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CLASS_SHARE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ShareLink> & { error?: string };
      if (res.ok && body.url && body.whatsappHref && (body.mode === "clone" || body.mode === "invite")) {
        setLink({ mode: body.mode, url: body.url, whatsappHref: body.whatsappHref });
      } else {
        setError(body.error ?? "Paylaşım bağlantısı bu sefer hazırlanamadı. Yeniden dene.");
      }
    } catch {
      setError("İnternet bağlantını kontrol edip yeniden dene.");
    }
    setLoading(false);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Bağlantı kopyalandı.");
    } catch {
      toast.error(`Kopyalanamadı. Bağlantı: ${link.url}`);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cp-class-share-pill cx-glass"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          if (!link) void load();
        }}
      >
        {CLASS_SHARE_LABEL}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="cx-confirm-backdrop" />
          <Dialog.Popup className="cx-confirm cp-class-share-dialog" finalFocus={triggerRef} data-testid="class-share-dialog">
            <div className="cx-confirm-head">
              <Dialog.Title className="cx-confirm-title">{CLASS_SHARE_LABEL}</Dialog.Title>
              <Dialog.Close className="cx-confirm-close cx-glass" aria-label="Kapat">
                <X aria-hidden />
              </Dialog.Close>
            </div>
            <Dialog.Description className="cx-confirm-text">
              {link?.mode === "invite" ? PREP_SHARE_NOTE : CLASS_SHARE_NOTE}
            </Dialog.Description>
            {link?.mode === "clone" ? <p className="cp-class-share-reward">{CLASS_SHARE_REWARD_NOTE}</p> : null}
            {link ? (
              <>
                <code className="cp-class-share-link" data-testid="class-share-url">
                  {link.url}
                </code>
                <div className="cx-confirm-actions">
                  <ExternalAnchor href={link.whatsappHref} className="cx-confirm-btn" data-tone="brand">
                    <Share2 aria-hidden />
                    WhatsApp&apos;ta paylaş
                  </ExternalAnchor>
                  <button type="button" className="cx-confirm-btn" onClick={() => void copy()}>
                    <Copy aria-hidden />
                    Bağlantıyı kopyala
                  </button>
                </div>
              </>
            ) : error ? (
              <div className="cx-confirm-actions">
                <p className="cp-class-share-status" role="alert">
                  {error}
                </p>
                <button type="button" className="cx-confirm-btn" onClick={() => void load()}>
                  Yeniden dene
                </button>
              </div>
            ) : (
              <p className="cp-class-share-status" role="status" aria-live="polite">
                Bağlantı hazırlanıyor…
              </p>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
