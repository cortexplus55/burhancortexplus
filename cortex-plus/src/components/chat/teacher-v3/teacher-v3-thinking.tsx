"use client";

import { useEffect, useState } from "react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { THINKING_SECOND_AT_MS, thinkingPhase, thoughtLabel } from "@/lib/teacher/thinking-phase";

/**
 * Öğretmen yanıtının üst satırı (öğretmen v3). Beklerken küçük işaretin yanında parıltılı tek satır: "Bilgileri
 * birleştiriyor" → "Verileri analiz ediyor" (süreye göre) → "Yanıtı yazıyor" (ilk parça gelince). Yanıt bitince satır
 * sessizce "💡 N sn düşündü" etiketine döner. Hareket azaltmada parıltı yok (CSS).
 */
export function TeacherV3Status({
  startedAt,
  writing,
  finishedMs,
}: {
  /** Gönderim anı (ms, `Date.now()`); bekleme sürerken verilir. */
  startedAt: number | null;
  /** İlk parça geldi mi. */
  writing: boolean;
  /** Yanıt bittiyse gönderimden ilk parçaya geçen süre; verilince etiket çizilir. */
  finishedMs?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const waiting = finishedMs == null && startedAt != null && !writing;

  useEffect(() => {
    if (!waiting || startedAt == null) return;
    const remaining = THINKING_SECOND_AT_MS - (Date.now() - startedAt);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 16);
    return () => window.clearTimeout(timer);
  }, [waiting, startedAt]);

  if (finishedMs != null) {
    return (
      <p className="cx-v3-status" data-state="done">
        <span className="cx-v3-thought">{thoughtLabel(finishedMs)}</span>
      </p>
    );
  }
  const phase = thinkingPhase(startedAt == null ? 0 : now - startedAt, writing);
  return (
    <p className="cx-v3-status" data-state={writing ? "writing" : "thinking"} role="status" aria-label={phase}>
      <span className="cx-v3-status-mark" aria-hidden>
        <CortexMark size={16} />
      </span>
      <span className="cx-v3-shimmer" aria-hidden key={phase}>
        {phase}
      </span>
    </p>
  );
}
