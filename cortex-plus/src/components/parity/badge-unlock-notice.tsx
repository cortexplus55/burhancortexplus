"use client";

import { useEffect, useState } from "react";
import type { BadgeJourney, BadgeState } from "@/lib/gamification/badges";
import { BadgeArt } from "@/components/parity/badge-art";
import { fetchJourney } from "@/components/parity/journey-dialog";

const SEEN_KEY = "cortex-badges-seen";
const CHECKED_KEY = "cortex-badges-checked";

function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : null;
  } catch {
    return null;
  }
}

function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* depolama kapalıysa bildirim her oturumda bir kez çıkabilir */
  }
}

/** Görülmemiş, açılmış rozetlerden en yenisi. İlk kontrolde hiçbiri — geçmiş rozetler duyurulmaz. */
export function newestUnseenBadge(journey: BadgeJourney, seen: string[] | null): BadgeState | null {
  if (!seen) return null;
  const fresh = journey.badges.filter((b) => b.unlocked && !seen.includes(b.id));
  if (!fresh.length) return null;
  return [...fresh].sort((a, b) => String(b.unlockedAt ?? "").localeCompare(String(a.unlockedAt ?? "")))[0];
}

/**
 * "Yeni rozet açıldı" duyurusu.
 *
 * Oturumda bir kez bakılıyor (her sayfa geçişinde on sorgu atmamak için).
 * İlk bakışta mevcut rozetler sessizce "görüldü" sayılıyor: sistem
 * geldiğinde eski öğrencinin önüne sekiz pencere birden çıkmasın.
 */
export function BadgeUnlockNotice({
  onOpenBadges,
  onJourney,
}: {
  onOpenBadges: () => void;
  onJourney?: (journey: BadgeJourney) => void;
}) {
  const [badge, setBadge] = useState<BadgeState | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHECKED_KEY)) return;
      sessionStorage.setItem(CHECKED_KEY, "1");
    } catch {
      /* sessionStorage yoksa yine de bir kez bak */
    }
    let cancelled = false;
    void fetchJourney().then((journey) => {
      if (cancelled || !journey) return;
      onJourney?.(journey);
      const seen = readSeen();
      const unlocked = journey.badges.filter((b) => b.unlocked).map((b) => b.id);
      const next = newestUnseenBadge(journey, seen);
      writeSeen([...new Set([...(seen ?? []), ...unlocked])]);
      if (next) setBadge(next);
    });
    return () => {
      cancelled = true;
    };
  }, [onJourney]);

  if (!badge) return null;

  return (
    <div className="cp-jr-unlock-backdrop" role="dialog" aria-modal="true" aria-label="Yeni rozet">
      <div className="cp-jr-unlock">
        <span className="cp-jr-unlock-art">
          <BadgeArt id={badge.id} locked={false} />
        </span>
        <span className="cp-jr-kicker">Yeni rozet açıldı</span>
        <h2>{badge.name}</h2>
        <p>{badge.task}</p>
        <div className="cp-jr-unlock-actions">
          <button
            type="button"
            className="cp-jr-cta"
            onClick={() => {
              setBadge(null);
              onOpenBadges();
            }}
          >
            Rozetlerimi gör
          </button>
          <button type="button" className="cp-jr-unlock-dismiss" onClick={() => setBadge(null)}>
            Devam et
          </button>
        </div>
      </div>
    </div>
  );
}
