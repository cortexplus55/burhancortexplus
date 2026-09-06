"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function DocumentRetryButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      const response = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(result.error ?? "Doküman yeniden işlenemedi.");
        return;
      }
      toast.success("Doküman hazır.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={retry}
      className="text-xs font-medium text-[var(--astra-primary)] underline underline-offset-2 disabled:opacity-60"
    >
      {pending ? "İşleniyor…" : "Yeniden işle"}
    </button>
  );
}
