"use client";

import { useState } from "react";
import type { LevelDirection, LevelHint } from "@/lib/learning/prep-level";

const COPY: Record<LevelHint, { title: string; body: string }> = {
  too_hard: {
    title: "Bu hazırlık sana fazla zor gelebilir",
    body: "Son iki etkinlikte yanlışların çoktu. Biraz daha kolay sorular yardımcı olabilir.",
  },
  too_easy: {
    title: "Bu hazırlık sana kolay gelebilir",
    body: "Son iki etkinliği neredeyse hatasız bitirdin. Biraz daha zor sorular seni daha çok geliştirir.",
  },
};

/**
 * Astra'nın sonuç sonrası düzey önerisi (18 Ekim 2026): "Çok kolay / Tam kararında / Çok zor".
 * Seçim bütün konuların düzeyini bir basamak kaydırır (`/api/learning/exam-prep/level`);
 * sıradaki etkinlik yeni düzeyde hazırlanır. "Tam kararında" hiçbir şeyi değiştirmez.
 */
export function LevelSuggestCard({ prepId, hint }: { prepId: string; hint: LevelHint }) {
  const [state, setState] = useState<"ask" | "busy" | "easier" | "harder" | "kept" | "failed">("ask");

  async function choose(direction: LevelDirection) {
    setState("busy");
    try {
      const res = await fetch("/api/learning/exam-prep/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, direction }),
      });
      if (!res.ok) throw new Error();
      setState(direction);
    } catch {
      setState("failed");
    }
  }

  const copy = COPY[hint];
  return (
    <div className="cp-rating-card cp-level-card">
      <p className="cp-rating-question">{copy.title}</p>
      <p className="cp-rating-lead">{copy.body}</p>
      {state === "easier" || state === "harder" || state === "kept" ? (
        <p className="cp-rating-thanks" role="status">
          {state === "easier"
            ? "Tamam, sonraki etkinlikler daha kolay hazırlanacak."
            : state === "harder"
              ? "Tamam, sonraki etkinlikler daha zor hazırlanacak."
              : "Tamam, düzey aynı kalıyor."}
        </p>
      ) : (
        <div className="cp-rating-options" role="group" aria-label={copy.title}>
          <button type="button" className="cp-rating-option" disabled={state === "busy"} onClick={() => void choose("easier")}>
            Daha kolay
          </button>
          <button type="button" className="cp-rating-option" disabled={state === "busy"} onClick={() => setState("kept")}>
            Tam kararında
          </button>
          <button type="button" className="cp-rating-option" disabled={state === "busy"} onClick={() => void choose("harder")}>
            Daha zor
          </button>
        </div>
      )}
      {state === "failed" ? (
        <p className="cp-rating-error" role="alert">
          Kaydedilemedi, bir kez daha dener misin?
        </p>
      ) : null}
    </div>
  );
}
