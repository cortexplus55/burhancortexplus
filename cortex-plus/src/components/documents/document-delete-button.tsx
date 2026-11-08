"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function DocumentDeleteButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        // 8 Kasım 2026: küçük, altı çizili kırmızı yazı açık temada okunmuyordu; ikincil ama okunur hap.
        className="cp-docs-delete cp-tap"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Sil
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Belge silme onayı">
      <span className="basis-full text-red-200">Belge ve bu belgeye bağlı çalışma planları ile etkinlikler kalıcı olarak silinecek.</span>
      <button
        type="button"
        disabled={pending}
        className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200 disabled:opacity-60"
        onClick={() =>
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
            router.refresh();
            } catch {
              toast.error("Silme iletilemedi. Yeniden deneyebilirsin.");
            }
          })
        }
      >
        {pending ? "Siliniyor…" : "Evet, sil"}
      </button>
      <button
        type="button"
        className="text-[var(--cs-muted)] underline"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Vazgeç
      </button>
    </span>
  );
}
