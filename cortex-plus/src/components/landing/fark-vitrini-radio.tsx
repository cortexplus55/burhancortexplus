"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, SkipForward } from "lucide-react";
import { ShowcaseCompareBlock, ShowcaseHead } from "@/components/landing/fark-vitrini-parts";
import { demoRadioPlaylist, type DemoPodcast } from "@/lib/demo/demo-podcasts";
import { RADIO_SHOWCASE } from "@/lib/marketing/fark-vitrini";
import { cn } from "@/lib/utils";
import "@/styles/fark-vitrini.css";

/**
 * Kart A — Sınav Radyosu önizlemesi (20 Kasım 2026, Faz 7).
 *
 * Kayıtlı ünite podcastlerini (`demoRadioPlaylist`, `public/ornek/` altındaki dosyalar) sırayla çalar; biri bitince
 * (`ended`) sıradakine geçer, son kesitten sonra akış başa döner ve durur. Liste 1–4 kesitle çalışır; boşsa kart çizilmez.
 *
 * Sıfır istek: ses yalnız düğmeye basılınca yüklenir. `<audio>` kaynaksız ve `preload="none"` çizilir; kaynak tıklamada
 * atanır (oynatma kullanıcının dokunuşuyla başlar, kendiliğinden çalmaz). Model, ses üretimi ya da kredi yok.
 *
 * Çalarken kilit ekranı ve kulaklık denetimleri için `MediaSession` bilgisi yazılır (tarayıcı destekliyorsa; arka
 * planda çalmayı tarayıcı belirler). Dalga çubukları yalnız çalarken oynar; hareket azaltmada durur (CSS).
 */

const WAVE_BARS = 24;
const DEFAULT_PLAYLIST: readonly DemoPodcast[] = demoRadioPlaylist();

type RadioState = "idle" | "playing" | "paused";

function clockLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function unitLabel(at: number, item: DemoPodcast): string {
  return `${RADIO_SHOWCASE.unitPrefix} ${at + 1} · ${item.unit}`;
}

export function RadioShowcaseCard({ playlist = DEFAULT_PLAYLIST }: { playlist?: readonly DemoPodcast[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Şu an `<audio>`a atanmış kesit (−1: hiçbiri; ilk tıklamaya kadar kaynak yok). */
  const loadedRef = useRef(-1);
  const indexRef = useRef(0);
  const finishedRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<RadioState>("idle");
  const [ms, setMs] = useState(0);
  const [failed, setFailed] = useState(false);

  const playing = state === "playing";
  const current = playlist[index];

  function fail(error?: unknown) {
    // Kaynak değişirken yarıda kesilen oynatma hata değildir.
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") return;
    setState("paused");
    setFailed(true);
  }

  function playAt(at: number) {
    const audio = audioRef.current;
    const item = playlist[at];
    if (!audio || !item) return;
    if (loadedRef.current !== at) {
      audio.src = item.src;
      loadedRef.current = at;
      setMs(0);
    } else if (finishedRef.current) {
      audio.currentTime = 0;
      setMs(0);
    }
    finishedRef.current = false;
    indexRef.current = at;
    setIndex(at);
    setFailed(false);
    setState("playing");
    try {
      const started = audio.play() as Promise<void> | undefined;
      if (started && typeof started.catch === "function") started.catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  function pause() {
    audioRef.current?.pause();
    setState("paused");
  }

  function toggle() {
    if (playing) pause();
    else playAt(indexRef.current);
  }

  function skip() {
    if (playlist.length < 2) return;
    const next = (indexRef.current + 1) % playlist.length;
    if (playing) {
      playAt(next);
      return;
    }
    // Duraklatılmışken yalnız sıradaki seçilir; ses yüklenmez (sıradaki tıklamada başlar). Yüklü kesite geri
    // dönülürse baştan çalar.
    const audio = audioRef.current;
    if (audio && loadedRef.current === next) audio.currentTime = 0;
    indexRef.current = next;
    finishedRef.current = false;
    setIndex(next);
    setMs(0);
  }

  function onEnded() {
    const at = indexRef.current;
    if (at + 1 < playlist.length) {
      playAt(at + 1);
      return;
    }
    // Akış bitti: başa döner ve durur; sonraki tıklama Ünite 1'den başlar.
    finishedRef.current = true;
    indexRef.current = 0;
    setIndex(0);
    setMs(0);
    setState("idle");
  }

  // Kilit ekranı ve kulaklık denetimleri (destekleyen tarayıcıda). Denetimler en güncel işleve ref üzerinden gider.
  const controls = useRef({ pause, skip, playAt });
  useEffect(() => {
    controls.current = { pause, skip, playAt };
  });

  useEffect(() => {
    if (!playing || !current || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    try {
      if (typeof MediaMetadata !== "undefined") {
        session.metadata = new MediaMetadata({
          title: unitLabel(index, current),
          artist: `Cortex Plus · ${RADIO_SHOWCASE.stationLine}`,
          album: current.source,
        });
      }
      session.setActionHandler("play", () => controls.current.playAt(indexRef.current));
      session.setActionHandler("pause", () => controls.current.pause());
      session.setActionHandler("nexttrack", playlist.length > 1 ? () => controls.current.skip() : null);
    } catch {
      // Eski tarayıcı bazı eylemleri tanımayabilir; denetimsiz de çalar.
    }
  }, [playing, index, current, playlist.length]);

  // Kart sayfadan çıkınca ses susar ve denetimler bırakılır.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio && !audio.paused) audio.pause();
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      try {
        for (const action of ["play", "pause", "nexttrack"] as const) navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // yok say
      }
    };
  }, []);

  if (!current) return null;

  const pct = Math.min(100, (ms / current.durationMs) * 100);
  const titleId = `${RADIO_SHOWCASE.id}-title`;

  return (
    <article
      className={cn("fv-card fv-card--radio", playing && "is-playing")}
      aria-labelledby={titleId}
      data-testid="showcase-radio"
      data-state={state}
    >
      <ShowcaseHead id={titleId} title={RADIO_SHOWCASE.title} plus>
        <span className="fv-badge fv-badge--ok">{RADIO_SHOWCASE.badge}</span>
      </ShowcaseHead>

      <div className="fv-stage">
        <div className="fv-lock">
          <p className="fv-lock-top">
            <Lock className="fv-lock-icon" aria-hidden />
            <span>{RADIO_SHOWCASE.nowPlaying}</span>
          </p>
          <div className="fv-now">
            <span className="fv-art" aria-hidden>
              {index + 1}
            </span>
            {/* Ünite değişince yazı yeniden çizilir (CSS geçişi); sabit canlı bölge yeni üniteyi ekran okuyucuya söyler. */}
            <div className="fv-now-text" aria-live="polite">
              <div className="fv-now-swap" key={index}>
                <p className="fv-now-unit" data-testid="radio-now">
                  {unitLabel(index, current)}
                </p>
                <p className="fv-now-src">
                  {current.source} · {RADIO_SHOWCASE.stationLine}
                </p>
              </div>
            </div>
          </div>
          <div className="fv-wave" aria-hidden>
            {Array.from({ length: WAVE_BARS }, (_, bar) => (
              <span key={bar} style={{ ["--fv-i" as string]: bar }} />
            ))}
          </div>
          <div className="fv-progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="fv-times" aria-hidden>
            <span>{clockLabel(ms)}</span>
            <span>{clockLabel(current.durationMs)}</span>
          </p>
          <div className="fv-controls">
            <button type="button" className="fv-play" onClick={toggle} data-testid="radio-toggle">
              <span className="fv-play-glyph" aria-hidden>
                {playing ? "⏸" : "▶"}
              </span>{" "}
              {playing ? RADIO_SHOWCASE.pause : RADIO_SHOWCASE.play}
            </button>
            {playlist.length > 1 ? (
              <button type="button" className="fv-icon-btn" onClick={skip} aria-label={RADIO_SHOWCASE.next}>
                <SkipForward className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <ol className="fv-queue" aria-label={RADIO_SHOWCASE.queueLabel}>
          {playlist.map((item, at) => (
            <li key={item.src} className={cn("fv-queue-item", at === index && "is-now")} aria-current={at === index ? "true" : undefined}>
              <span className="fv-queue-pill">{unitLabel(at, item)}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="fv-note">{RADIO_SHOWCASE.note}</p>
      {failed ? (
        <p className="fv-status" role="status">
          {RADIO_SHOWCASE.failed}
        </p>
      ) : null}

      <ShowcaseCompareBlock compare={RADIO_SHOWCASE.compare} />

      <audio
        ref={audioRef}
        preload="none"
        onEnded={onEnded}
        // Kulaklık, başka bir ses ya da işletim sistemi durdurursa ekran da durur; biten kesitin "pause"u sayılmaz.
        onPause={(event) => {
          if (!event.currentTarget.ended) setState("paused");
        }}
        onPlaying={() => setState("playing")}
        onTimeUpdate={(event) => setMs(event.currentTarget.currentTime * 1000)}
        onError={() => {
          if (loadedRef.current >= 0) fail();
        }}
      />
    </article>
  );
}
