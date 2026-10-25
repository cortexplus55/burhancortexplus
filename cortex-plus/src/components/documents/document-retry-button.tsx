"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";

export function DocumentRetryButton({
  documentId,
  autoOnce = false,
}: {
  documentId: string;
  /** Takılı belgede sayfa açılınca bir kez dener. Aynı oturumda tekrarlamaz. */
  autoOnce?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry(silent = false) {
    setPending(true);
    try {
      const result = await requestDocumentProcessing({
        documentId,
        // An explicit press: a map that ran out of attempts starts fresh.
        post: (body) => postDocumentProcess({ ...body, retryMap: true }),
      });
      // Silent automatic retries; toast only on terminal failure. A map that
      // could not be built again just offers "Tekrar dene" again (no error).
      if (!result.ok && result.body.canRetry === true) return;
      if (!result.ok) {
        if (!silent) {
          toast.error(
            typeof result.body.error === "string" ? result.body.error : "Doküman yeniden işlenemedi.",
          );
        }
        return;
      }
      if (!silent) toast.success("Doküman hazır.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  useEffect(() => {
    if (!autoOnce) return;
    const key = `doc-recover:${documentId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    void retry(true);
    // Yalnız ilk açılışta, belge başına bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOnce, documentId]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void retry(false)}
      className="text-xs font-medium text-[var(--cs-primary)] underline underline-offset-2 disabled:opacity-60"
    >
      {pending ? "İşleniyor…" : "Yeniden Dene"}
    </button>
  );
}
