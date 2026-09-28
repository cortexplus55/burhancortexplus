"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";

export function DocumentRetryButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      const result = await requestDocumentProcessing({
        documentId,
        post: postDocumentProcess,
      });
      // Silent automatic retries; toast only on terminal failure.
      if (!result.ok) {
        toast.error(
          typeof result.body.error === "string" ? result.body.error : "Doküman yeniden işlenemedi.",
        );
        return;
      }
      toast.success("Doküman hazır.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={retry}
      className="text-xs font-medium text-[var(--cs-primary)] underline underline-offset-2 disabled:opacity-60"
    >
      {pending ? "İşleniyor…" : "Yeniden işle"}
    </button>
  );
}
