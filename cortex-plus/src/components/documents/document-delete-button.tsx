"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function DocumentDeleteButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-xs text-red-300/80 underline hover:text-red-200"
        onClick={() => setConfirming(true)}
      >
        Sil
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        className="rounded-full bg-red-500/20 px-2.5 py-1 text-red-200 disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            const res = await fetch(`/api/documents/${documentId}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              toast.error(body.error ?? "Silinemedi.");
              setConfirming(false);
              return;
            }
            toast.success("Belge silindi.");
            router.refresh();
          })
        }
      >
        {pending ? "Siliniyor…" : "Evet, sil"}
      </button>
      <button
        type="button"
        className="text-[var(--cs-muted)] underline"
        onClick={() => setConfirming(false)}
      >
        Vazgeç
      </button>
    </span>
  );
}
