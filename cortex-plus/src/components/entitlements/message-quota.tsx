"use client";

import { useGate } from "@/components/entitlements/entitlement-ui";
import "@/styles/entitlements.css";

/**
 * Öğretmen çubuğunun hak göstergesi (Faz 3B): ücretsiz hesapta "{N} mesaj kaldı" (1 kaldıysa uyarı tonu). Yalnız günlük
 * sayaçlı kapıda görünür; Plus, Sigma ve Kurucu'da çizilmez (kredi sayısı gösterilmez). Sağlayıcı yoksa hiçbir şey.
 */
export function MessageQuota({ variant }: { variant: "slim" | "inline" }) {
  const gate = useGate("teacher.message");
  if (gate.state !== "limited" || gate.period !== "day" || typeof gate.remaining !== "number") return null;
  return (
    <span className="cx-t-meta-s cx-msg-quota" data-variant={variant} data-low={gate.remaining <= 1 ? "" : undefined} role="status">
      {gate.remaining} mesaj kaldı
    </span>
  );
}
