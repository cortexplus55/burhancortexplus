"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Info, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatBadgeDate,
  type BadgeJourney,
  type BadgeState,
} from "@/lib/gamification/badges";
import { BadgeArt } from "@/components/parity/badge-art";
import "@/styles/parity-shell.css";

export type JourneyTab = "streak" | "badges";

/** Rozet verisini çeken küçük kanca; pencere ve "yeni rozet" bildirimi paylaşıyor. */
export async function fetchJourney(): Promise<BadgeJourney | null> {
  try {
    const res = await fetch("/api/rozetler", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as BadgeJourney;
  } catch {
    return null;
  }
}

/**
 * Seri ve rozetler penceresi — üst çubuktaki alev düğmesi açıyor.
 *
 * Referans üründe aynı düğme tam ekran bir pencereye açılıyor: bir sekmede
 * seri (bugünkü sayı, en uzun seri, sıradaki seri rozeti, sıradaki görev,
 * haftanın günleri), diğerinde on iki rozet. Bizde düğme vardı ama hiçbir
 * şey açmıyordu.
 *
 * Referans üründe bir "günlük çalışma hedefi: 35/30 dk" satırı da var.
 * O satır bilerek yok: ekranda kalma süresini ölçmüyoruz, ölçmediğimiz bir
 * dakikayı hedefe bağlamak uydurma bir sayı göstermek olurdu
 * (bkz. lib/learning/activity-history.ts).
 */
export function JourneyDialog({
  open,
  onClose,
  tab: initialTab = "streak",
  onLoaded,
}: {
  open: boolean;
  onClose: () => void;
  tab?: JourneyTab;
  onLoaded?: (journey: BadgeJourney) => void;
}) {
  const [tab, setTab] = useState<JourneyTab>(initialTab);
  const [journey, setJourney] = useState<BadgeJourney | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [infoOpen, setInfoOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setState("loading");
    const data = await fetchJourney();
    if (!data) {
      setState("error");
      return;
    }
    setJourney(data);
    setState("ready");
    onLoaded?.(data);
  }, [onLoaded]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setInfoOpen(false);
    void load();
    closeRef.current?.focus();
  }, [open, initialTab, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoOpen) setInfoOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, infoOpen, onClose]);

  if (!open) return null;

  return (
    <div className="cp-jr" role="dialog" aria-modal="true" aria-label="Seri ve rozetler">
      <div className="cp-jr-top">
        <button
          type="button"
          className="cp-jr-icon-btn"
          aria-label={tab === "streak" ? "Seri nasıl işler?" : "Rozetler nasıl açılır?"}
          onClick={() => setInfoOpen(true)}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" ref={closeRef} className="cp-jr-close" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
          Kapat
        </button>
      </div>

      <div className="cp-jr-body">
        <div className="cp-jr-tabs" role="tablist" aria-label="Seri ve rozetler">
          {(
            [
              ["streak", "Seri"],
              ["badges", "Rozetler"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn("cp-jr-tab", tab === id && "cp-jr-tab--active")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {state === "loading" && !journey ? (
          <p className="cp-jr-status" role="status">
            Yükleniyor…
          </p>
        ) : state === "error" && !journey ? (
          <div className="cp-jr-status">
            <p>Rozetler yüklenemedi.</p>
            <button type="button" className="cp-jr-retry" onClick={() => void load()}>
              Tekrar dene
            </button>
          </div>
        ) : journey ? (
          tab === "streak" ? (
            <StreakTab journey={journey} onShowBadges={() => setTab("badges")} />
          ) : (
            <BadgesTab journey={journey} onNavigate={onClose} />
          )
        ) : null}
      </div>

      {infoOpen ? <InfoSheet tab={tab} onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}

function StreakTab({
  journey,
  onShowBadges,
}: {
  journey: BadgeJourney;
  onShowBadges: () => void;
}) {
  const { streak, nextStreak, next, unlockedCount, badges } = journey;
  const isRecord = streak.current > 0 && streak.current >= streak.longest;
  return (
    <section className="cp-jr-streak" aria-label="Seri">
      <div className="cp-jr-hero">
        <span className={cn("cp-jr-glow", streak.current > 0 && "is-on")} aria-hidden />
        <strong className="cp-jr-count">{streak.current}</strong>
        <span className="cp-jr-count-label">günlük seri</span>
        <span className="cp-jr-count-hint">
          {streak.current > 0
            ? "Her gün bir adım at, serin büyüsün"
            : "Bugün bir ders, test ya da soru ile serini başlat"}
        </span>
      </div>

      <div className="cp-jr-stats">
        <div className="cp-jr-stat">
          <span>En uzun seri</span>
          <strong>
            {streak.longest} gün <em>{isRecord ? "Şu anki serin" : "Rekorun"}</em>
          </strong>
        </div>
        {nextStreak ? (
          <button type="button" className="cp-jr-stat cp-jr-stat--link" onClick={onShowBadges}>
            <span>Sıradaki seri rozeti</span>
            <strong>
              {nextStreak.name} <em>{nextStreak.progress?.label}</em>
            </strong>
          </button>
        ) : (
          <div className="cp-jr-stat">
            <span>Seri rozetleri</span>
            <strong>
              Hepsi açıldı <em>3 / 3</em>
            </strong>
          </div>
        )}
      </div>

      {next ? (
        <button type="button" className="cp-jr-next-row" onClick={onShowBadges}>
          <BadgeArt id={next.id} locked className="cp-jr-next-row-art" />
          <span className="cp-jr-next-row-text">
            <strong>
              Sıradaki görev: {next.name}
              <em className="cp-jr-pill">
                {unlockedCount}/{badges.length}
              </em>
            </strong>
            <span>
              {next.task}
              {next.progress ? ` · ${next.progress.label}` : ""}
            </span>
          </span>
        </button>
      ) : null}

      <div className="cp-jr-week">
        <span className="cp-jr-week-title">Bu hafta</span>
        <ol>
          {streak.week.map((day) => (
            <li key={day.iso} className={cn(day.isToday && "is-today")}>
              <span className="cp-jr-week-day">{day.label}</span>
              <span
                className={cn("cp-jr-week-flame", day.active && "is-on")}
                title={day.active ? "Çalıştın" : "Kayıt yok"}
              >
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function BadgesTab({ journey, onNavigate }: { journey: BadgeJourney; onNavigate: () => void }) {
  const { badges, unlockedCount, next } = journey;
  return (
    <section className="cp-jr-badges" aria-label="Rozetler">
      <header className="cp-jr-badges-head">
        <h2>Rozetler</h2>
        <p>Roketten en yakın yıldıza: her durak, Cortex&apos;te attığın bir adım.</p>
        <span className="cp-jr-pill">
          {unlockedCount}/{badges.length} açıldı
        </span>
      </header>

      {next ? <NextTask badge={next} onNavigate={onNavigate} /> : <AllDone />}

      <ul className="cp-jr-grid">
        {badges.map((badge) => (
          <BadgeTile key={badge.id} badge={badge} />
        ))}
      </ul>
    </section>
  );
}

function NextTask({ badge, onNavigate }: { badge: BadgeState; onNavigate: () => void }) {
  const pct = badge.progress
    ? Math.round((Math.min(badge.progress.value, badge.progress.target) / badge.progress.target) * 100)
    : 0;
  return (
    <div className="cp-jr-next">
      <div className="cp-jr-next-head">
        <span className="cp-jr-next-art">
          <BadgeArt id={badge.id} locked />
        </span>
        <div>
          <span className="cp-jr-kicker">Sıradaki görev</span>
          <strong>{badge.name}</strong>
          <p>{badge.goal}</p>
        </div>
      </div>
      {badge.progress ? (
        <div className="cp-jr-progress">
          <span
            className="cp-jr-progress-bar"
            role="progressbar"
            aria-label={`${badge.name} ilerlemesi`}
            aria-valuemin={0}
            aria-valuemax={badge.progress.target}
            aria-valuenow={Math.min(badge.progress.value, badge.progress.target)}
          >
            <span style={{ width: `${pct}%` }} />
          </span>
          <em>{badge.progress.label}</em>
        </div>
      ) : null}
      <Link href={badge.cta.href} className="cp-jr-cta" onClick={onNavigate}>
        {badge.cta.label}
      </Link>
    </div>
  );
}

function AllDone() {
  return (
    <div className="cp-jr-next cp-jr-next--done">
      <Rocket className="h-6 w-6" aria-hidden />
      <strong>Bütün rozetler açıldı</strong>
      <p>Yolculuğun en yakın yıldıza ulaştı. Serini sürdürmeye devam et.</p>
    </div>
  );
}

function BadgeTile({ badge }: { badge: BadgeState }) {
  const date = formatBadgeDate(badge.unlockedAt);
  return (
    <li className={cn("cp-jr-tile", badge.unlocked ? "is-unlocked" : "is-locked")}>
      <span className="cp-jr-tile-art">
        <BadgeArt id={badge.id} locked={!badge.unlocked} />
      </span>
      <strong>{badge.name}</strong>
      <span className="cp-jr-tile-task">{badge.task}</span>
      <span className="cp-jr-tile-meta">
        {badge.unlocked
          ? (date ?? "Açıldı")
          : (badge.progress?.label ?? "Kilitli")}
      </span>
      <span className="sr-only">{badge.unlocked ? "Açık rozet" : "Kilitli rozet"}</span>
    </li>
  );
}

function InfoSheet({ tab, onClose }: { tab: JourneyTab; onClose: () => void }) {
  return (
    <div className="cp-jr-info-backdrop" onClick={onClose}>
      <div
        className="cp-jr-info"
        role="dialog"
        aria-modal="true"
        aria-label={tab === "streak" ? "Seri nasıl işler" : "Rozetler nasıl açılır"}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cp-jr-info-close" aria-label="Kapat" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
        </button>
        {tab === "streak" ? (
          <>
            <h3>Seri nasıl işler</h3>
            <p>
              Bir ders, test, sözlü, tekrar, deneme ya da AI öğretmene bir soru — günde bir tanesi
              serini bir gün uzatır.
            </p>
            <ul>
              <li>
                <strong>Gün Türkiye saatiyle değişir.</strong> Gece yarısından önce bir adım atman
                yeterli.
              </li>
              <li>
                <strong>Boş geçen gün seriyi sıfırlar.</strong> En uzun serin ise kayıtlı kalır.
              </li>
              <li>
                <strong>Seri rozetleri:</strong> art arda 3, 7 ve 30 gün Ay, Satürn ve Neptün&apos;ü
                açar.
              </li>
            </ul>
          </>
        ) : (
          <>
            <h3>Rozetler nasıl açılır</h3>
            <p>
              Roketten en yakın yıldıza on iki durak var. Dokuzu bir görevle, üçü yalnızca seriyle
              açılır.
            </p>
            <ul>
              <li>
                <strong>Görevler:</strong> ilk sınav planın, ilk denemen, bir konuda ustalaşman ya da
                davet ettiğin bir arkadaşın gibi.
              </li>
              <li>
                <strong>Seri:</strong> Ay, Satürn ve Neptün art arda 3, 7 ve 30 günlük çalışmayla
                açılır.
              </li>
            </ul>
            <p className="cp-jr-info-note">
              Önceki çalışmaların da sayılır: rozetler gelmeden önce yaptıkların hesaba katılır, hiçbir
              görevi yeniden yapman gerekmez.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
