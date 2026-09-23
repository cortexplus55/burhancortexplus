"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * İşlenen belge varken listeyi periyodik yeniler; öğrenci "İşleniyor"
 * yazısında takılı kalmaz. Sayfa görünür değilken bekler.
 */
export function DocumentStatusPoller({
  active,
  intervalMs = 5000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
