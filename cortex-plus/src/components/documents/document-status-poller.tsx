"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { postDocumentProcess } from "@/lib/documents/process-session";

/**
 * A visible document page advances a durable server job one bounded step at
 * a time. A reload therefore resumes extraction and mapping, not just the UI.
 */
export function DocumentStatusPoller({
  documentIds,
  intervalMs = 10_000,
}: {
  documentIds: string[];
  intervalMs?: number;
}) {
  const router = useRouter();
  const idsKey = documentIds.join(",");

  useEffect(() => {
    if (!idsKey) return;
    let busy = false;
    let cancelled = false;
    const ids = idsKey.split(",");
    const advance = async () => {
      if (busy || cancelled || document.visibilityState !== "visible") return;
      busy = true;
      try {
        for (const documentId of ids) {
          if (cancelled || document.visibilityState !== "visible") break;
          const result = await postDocumentProcess({ documentId }).catch(() => null);
          // A failed document is removed from the next server-rendered list;
          // the user sees its real error and can explicitly retry it.
          if (result?.status === 429) break;
        }
        if (!cancelled) router.refresh();
      } finally {
        busy = false;
      }
    };
    void advance();
    const id = window.setInterval(() => { void advance(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") void advance(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [idsKey, intervalMs, router]);

  return null;
}
