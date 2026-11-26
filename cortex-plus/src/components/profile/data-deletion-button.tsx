"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { requestDataDeletion } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ACCOUNT_DELETION_COPY } from "@/lib/privacy/account-deletion-copy";

/**
 * "Hesabımı kalıcı olarak sil" (26 Kasım 2026, App Store 5.1.1(v) ve Google Play hesap silme politikası). Devre dışı
 * bırakma değil: onaylanınca `requestDataDeletion` hesabı ve kişisel verileri hemen siler (`purgeUserData`), yarım
 * kalırsa günlük iş yeniden dener. Ödeme ve fatura kayıtları mevzuat gereği saklanır. Onay penceresi geri alınamaz
 * olduğunu ve mağaza aboneliğinin kendiliğinden iptal olmadığını söyler.
 */
export function DataDeletionButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  function confirm() {
    startTransition(async () => {
      const result = await requestDataDeletion();
      if (result.ok) {
        toast.success(result.status === "completed" ? ACCOUNT_DELETION_COPY.done : ACCOUNT_DELETION_COPY.queued);
        window.location.href = "/";
        return;
      }
      toast.error(ACCOUNT_DELETION_COPY.failed);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="cp-set-danger-btn"
        data-testid="account-delete-open"
        onClick={() => setOpen(true)}
      >
        {ACCOUNT_DELETION_COPY.button}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={ACCOUNT_DELETION_COPY.dialogTitle}
        description={ACCOUNT_DELETION_COPY.dialogText}
        confirmLabel={ACCOUNT_DELETION_COPY.confirm}
        pendingLabel="Siliniyor…"
        pending={pending}
        onConfirm={confirm}
        returnFocusRef={buttonRef}
      />
    </>
  );
}
