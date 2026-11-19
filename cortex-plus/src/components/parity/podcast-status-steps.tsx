"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  furtherPodcastStatus,
  parsePodcastStatus,
  PODCAST_STATUS_LABEL,
  PODCAST_STATUS_POLL_MS,
  PODCAST_STATUS_STEPS,
  podcastStatusRank,
  type PodcastStatus,
} from "@/lib/learning/podcast-status";
import "@/styles/podcast-status-steps.css";

/**
 * Podcast hazırlanırken adımlar (19 Kasım 2026, Faz 1-A §4.2): sıraya alındı → senaryo yazılıyor → ses hazırlanıyor →
 * dinlemeye hazır. Sunucu adımı `podcast_generation_status` satırından gelir; istemcinin kendi bildiği aşama (yanıt
 * geldi, ilk bölümün sesi hazır) onunla birleşir ve adım geri gitmez.
 */

/** Üretim sürerken sunucudaki adımı okur. Okuma düşerse sessizce bir sonraki turu bekler. */
export function usePodcastServerStatus(statusId: string | null, active: boolean): PodcastStatus | null {
  const [status, setStatus] = useState<PodcastStatus | null>(null);
  useEffect(() => {
    setStatus(null);
  }, [statusId]);
  useEffect(() => {
    if (!statusId || !active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const res = await fetch(`/api/learning/exam-prep/podcast/status?id=${encodeURIComponent(statusId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { status?: unknown } | null;
          const next = parsePodcastStatus(data?.status);
          if (alive && next) setStatus((current) => furtherPodcastStatus(current, next));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("podcast_status_poll_failed");
        }
      }
      if (alive) timer = setTimeout(() => void tick(), PODCAST_STATUS_POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [statusId, active]);
  return status;
}

/** Oynatıcı ilk bölümün sesini çalmaya hazır: sunucudaki satır da "ready" olsun (ölçüm ve destek için). */
export function reportPodcastReady(statusId: string | null): void {
  if (!statusId) return;
  void fetch("/api/learning/exam-prep/podcast/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: statusId }),
    keepalive: true,
  }).catch((error: unknown) => {
    console.warn("podcast_status_ready_failed", error instanceof Error ? error.name : "throw");
  });
}

export function PodcastStatusSteps({
  status,
  note,
  compact = false,
  announce = true,
}: {
  status: PodcastStatus | null;
  /** Adımların altında kısa durum notu (ör. yavaş ses parçası yeniden isteniyor). */
  note?: string | null;
  /** Ders sonu kartında küçük boy. */
  compact?: boolean;
  /** Kendisi canlı bölge mi; zaten canlı bölge olan bekleme ekranının içinde false (iç içe duyuru olmasın). */
  announce?: boolean;
}) {
  // Sunucudan henüz adım gelmediyse ilk adım sürüyor sayılır.
  const reached = Math.max(0, podcastStatusRank(status));
  const allDone = status === "ready";
  return (
    <div
      className={compact ? "pss pss--compact" : "pss"}
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
    >
      <ol className="pss-list" aria-label="Podcast hazırlık adımları">
        {PODCAST_STATUS_STEPS.map((step, index) => {
          const done = allDone || index < reached;
          const active = !allDone && index === reached;
          return (
            <li
              key={step}
              className={done ? "pss-step is-done" : active ? "pss-step is-active" : "pss-step"}
              aria-current={active ? "step" : undefined}
            >
              <span className="pss-dot" aria-hidden>
                {done ? <Check className="pss-icon" /> : active ? <Loader2 className="pss-icon pss-spin" /> : null}
              </span>
              <span className="pss-label">{PODCAST_STATUS_LABEL[step]}</span>
              <span className="pss-sr">{done ? " — tamamlandı" : active ? " — sürüyor" : " — sırada"}</span>
            </li>
          );
        })}
      </ol>
      {note ? <p className="pss-note">{note}</p> : null}
    </div>
  );
}
