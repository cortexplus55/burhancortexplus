"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/*
  20 Kasım 2026 (Faz 3): onay satır içindeydi; Escape çalışmıyor, odak kayboluyordu. Şimdi odak tuzaklı bir pencere
  (`ConfirmDialog`): Escape ve "Vazgeç" kapatır, odak "Sil" düğmesine döner. Silme aynı sunucu yolundan
  (`DELETE /api/documents/:id`).
*/
export function DocumentDeleteButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error ?? "Silinemedi.");
          setConfirming(false);
          return;
        }
        const body = await res.json();
        toast.success(body.status === "pending"
          ? "Belge erişime kapatıldı. Dosya temizliği arka planda tamamlanacak."
          : "Belge ve bağlı çalışma içerikleri silindi.");
        setConfirming(false);
        router.refresh();
      } catch {
        toast.error("Silme iletilemedi. Yeniden deneyebilirsin.");
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // 8 Kasım 2026: küçük, altı çizili kırmızı yazı açık temada okunmuyordu; ikincil ama okunur hap.
        className="cp-docs-delete cp-tap"
        onClick={() => setConfirming(true)}
        aria-haspopup="dialog"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Sil
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Belge silinsin mi?"
        description="Belge ve bu belgeye bağlı çalışma planları ile etkinlikler kalıcı olarak silinecek."
        confirmLabel="Evet, sil"
        pendingLabel="Siliniyor…"
        pending={pending}
        onConfirm={remove}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
