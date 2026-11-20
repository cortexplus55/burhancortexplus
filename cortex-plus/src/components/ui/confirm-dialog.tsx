"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { X } from "lucide-react";
import "@/styles/confirm-dialog.css";

/**
 * Geri alınamayan bir işlemin onay penceresi (20 Kasım 2026, Faz 3; ilk kullanım belge silme). Odak pencerenin içinde
 * kalır (odak tuzağı), Escape ve "Vazgeç" kapatır, odak pencereyi açan düğmeye döner. Açılışta odak "Vazgeç"te:
 * Enter'a yanlışlıkla basmak bir şey silmez. Dışarıya dokunmak kapatmaz (uyarı penceresi).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Vazgeç",
  pending = false,
  onConfirm,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** İşlem sürerken onay düğmesinin yazısı. */
  pendingLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  /** Pencere kapanınca odağın döneceği düğme (pencereyi açan). */
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        // İşlem sürerken pencere kapanmaz: sonuç gelmeden odak düğmeye dönerse öğrenci ikinci kez basar.
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="cx-confirm-backdrop" />
        <AlertDialog.Popup className="cx-confirm" initialFocus={cancelRef} finalFocus={returnFocusRef}>
          <div className="cx-confirm-head">
            <AlertDialog.Title className="cx-confirm-title">{title}</AlertDialog.Title>
            <AlertDialog.Close className="cx-confirm-close cx-glass" aria-label="Kapat" aria-disabled={pending || undefined}>
              <X aria-hidden />
            </AlertDialog.Close>
          </div>
          <AlertDialog.Description className="cx-confirm-text">{description}</AlertDialog.Description>
          <div className="cx-confirm-actions">
            <AlertDialog.Close ref={cancelRef} className="cx-confirm-btn" aria-disabled={pending || undefined}>
              {cancelLabel}
            </AlertDialog.Close>
            <button
              type="button"
              className="cx-confirm-btn"
              data-tone="danger"
              // Düğmeler süreç boyunca odakta kalır (disabled odağı pencereden düşürürdü); ikinci basış yok sayılır.
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => {
                if (!pending) onConfirm();
              }}
            >
              {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
