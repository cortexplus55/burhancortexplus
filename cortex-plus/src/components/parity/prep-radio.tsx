"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Headphones, LoaderCircle, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import {
  PREP_RADIO_EMPTY,
  PREP_RADIO_FAILED,
  PREP_RADIO_FINISHED,
  PREP_RADIO_LABEL,
  PREP_RADIO_NAME,
  PREP_RADIO_SKIPPED,
  RADIO_RESTART_MS,
  RADIO_SKIP_MS,
  formatRadioClock,
  locateRadioTime,
  nextRadioSpeed,
  radioEntrySub,
  radioSpeedLabel,
  radioTimeline,
  type RadioItem,
  type RadioSpeed,
  type RadioTrack,
} from "@/lib/learning/prep-radio";
import { bindRadioMediaSession, setRadioPlaybackState } from "@/lib/learning/radio-media-session";
import "@/styles/prep-radio.css";

export const PREP_RADIO_URL = "/api/learning/exam-prep/radio";

type Episode = { item: RadioItem; tracks: RadioTrack[]; timeline: ReturnType<typeof radioTimeline> };
type Status = "loading" | "ready" | "error" | "empty" | "finished";

/**
 * Sınav Radyosu (Faz 7, 20 Kasım 2026): hazırlık sayfasındaki giriş düğmesi ve ekranın altına sabitlenen radyo
 * çubuğu. Yalnız sesi önbellekte olan kayıtlı bölümler (liste sunucuda süzülür), sırayla ve kendiliğinden ilerleyerek;
 * 0 kredi, yeni seslendirme yok (ses ucu yalnız önbellekten okur, önbellekte olmayan bölüm 409 ile atlanır).
 */
export function PrepRadio({ prepId, prepTitle, items }: { prepId: string; prepTitle: string; items: RadioItem[] }) {
  const [open, setOpen] = useState(false);
  const barId = useId();
  const entryRef = useRef<HTMLButtonElement | null>(null);
  if (!items.length) return null;
  return (
    <>
      <button
        ref={entryRef}
        type="button"
        className="cp-prep-radio-entry"
        aria-expanded={open}
        aria-controls={open ? barId : undefined}
        data-testid="prep-radio-entry"
        onClick={() => setOpen(true)}
      >
        <span className="cp-prep-radio-entry-title">{PREP_RADIO_LABEL}</span>
        <span className="cp-prep-radio-entry-sub">{radioEntrySub(items.length)}</span>
      </button>
      {open ? (
        <PrepRadioBar
          id={barId}
          prepId={prepId}
          prepTitle={prepTitle}
          items={items}
          onClose={() => {
            setOpen(false);
            entryRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function validTracks(raw: unknown): RadioTrack[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((line) => {
    const row = line && typeof line === "object" ? (line as Record<string, unknown>) : null;
    const url = typeof row?.url === "string" ? row.url : "";
    const durationMs = typeof row?.durationMs === "number" && Number.isFinite(row.durationMs) && row.durationMs > 0 ? row.durationMs : 0;
    return url && durationMs ? [{ url, durationMs, text: typeof row?.text === "string" ? row.text : "" }] : [];
  });
}

export function PrepRadioBar({
  id,
  prepId,
  prepTitle,
  items,
  onClose,
}: {
  id?: string;
  prepId: string;
  prepTitle: string;
  items: RadioItem[];
  onClose: () => void;
}) {
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [speed, setSpeed] = useState<RadioSpeed>(1);

  const barRef = useRef<HTMLDivElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);
  const lineRef = useRef(0);
  const autoplayRef = useRef(true);
  const pendingSeekRef = useRef(0);
  const retriedRef = useRef(false);
  const speedRef = useRef<RadioSpeed>(speed);
  speedRef.current = speed;
  const episodeRef = useRef<Episode | null>(episode);
  episodeRef.current = episode;
  const indexRef = useRef(index);
  indexRef.current = index;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const positionRef = useRef(positionMs);
  positionRef.current = positionMs;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  const current = queue[index] ?? null;
  const currentId = current?.id ?? null;

  /** Bir bölümün `line` satırını `offsetMs`ten hazırlar; `autoplay` ise çalar. */
  const cueLine = useCallback((line: number, offsetMs: number, autoplay: boolean) => {
    const ep = episodeRef.current;
    const track = ep?.tracks[line];
    if (!ep || !track) return;
    const token = ++tokenRef.current;
    lineRef.current = line;
    let element = audioRef.current;
    if (!element) {
      element = new Audio();
      audioRef.current = element;
    }
    const audio = element;
    audio.pause();
    audio.src = track.url;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.playbackRate = speedRef.current;
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    const startAt = Math.max(0, offsetMs) / 1000;
    const arm = () => {
      if (token !== tokenRef.current) return;
      if (startAt > 0 && Number.isFinite(audio.duration) && startAt < audio.duration) audio.currentTime = startAt;
    };
    audio.onloadedmetadata = arm;
    if (audio.readyState >= 1) arm();
    audio.ontimeupdate = () => {
      if (token !== tokenRef.current) return;
      setPositionMs((ep.timeline.starts[line] ?? 0) + audio.currentTime * 1000);
    };
    audio.onended = () => {
      if (token !== tokenRef.current) return;
      if (line + 1 < ep.tracks.length) controlsRef.current.cue(line + 1, 0, true);
      else controlsRef.current.advance(true);
    };
    audio.onerror = () => {
      if (token !== tokenRef.current) return;
      // İmzalı bağlantının süresi dolmuş olabilir (1 saat): bölüm bir kez yeniden istenir, aynı yerden sürer.
      if (!retriedRef.current) {
        retriedRef.current = true;
        pendingSeekRef.current = (ep.timeline.starts[line] ?? 0) + startAt * 1000;
        autoplayRef.current = true;
        setNonce((value) => value + 1);
        return;
      }
      retriedRef.current = false;
      toast.message(PREP_RADIO_SKIPPED);
      controlsRef.current.advance(true);
    };
    setPositionMs((ep.timeline.starts[line] ?? 0) + Math.max(0, offsetMs));
    if (autoplay) {
      const started = audio.play() as Promise<void> | undefined;
      if (started && typeof started.then === "function") {
        started.then(
          () => {
            if (token === tokenRef.current) setPlaying(true);
          },
          () => {
            if (token === tokenRef.current) setPlaying(false);
          },
        );
      } else setPlaying(true);
    } else setPlaying(false);
    const next = ep.tracks[line + 1];
    if (next) {
      const pre = preloadRef.current ?? new Audio();
      pre.preload = "auto";
      pre.src = next.url;
      preloadRef.current = pre;
    }
  }, []);

  /** Sıradaki ya da belirli bir bölüme geçer. */
  const goTo = useCallback((target: number, autoplay: boolean) => {
    tokenRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
    if (target >= queueRef.current.length) {
      setStatus("finished");
      return;
    }
    const safe = Math.max(0, target);
    autoplayRef.current = autoplay;
    pendingSeekRef.current = 0;
    retriedRef.current = false;
    if (safe === indexRef.current && episodeRef.current && episodeRef.current.item.id === queueRef.current[safe]?.id) {
      // Aynı bölüm (tek bölümlük listede baştan): hazır bölüm etkisi yeniden başlatır.
      if (statusRef.current !== "ready") setStatus("ready");
      else cueLine(0, 0, autoplay);
      return;
    }
    setIndex(safe);
  }, [cueLine]);

  const seekTo = useCallback((ms: number) => {
    const ep = episodeRef.current;
    if (!ep) return;
    if (ms >= ep.timeline.totalMs && indexRef.current + 1 < queueRef.current.length) {
      goTo(indexRef.current + 1, playingRef.current);
      return;
    }
    const { index: line, offsetMs } = locateRadioTime(ep.timeline, ms);
    const audio = audioRef.current;
    if (line === lineRef.current && audio?.src) {
      audio.currentTime = offsetMs / 1000;
      setPositionMs((ep.timeline.starts[line] ?? 0) + offsetMs);
      return;
    }
    cueLine(line, offsetMs, playingRef.current);
  }, [cueLine, goTo]);

  const toggle = useCallback(() => {
    if (status === "finished") {
      goTo(0, true);
      return;
    }
    const ep = episodeRef.current;
    const audio = audioRef.current;
    if (!ep) return;
    if (playingRef.current) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    if (audio?.src) {
      const started = audio.play() as Promise<void> | undefined;
      if (started && typeof started.then === "function") started.then(() => setPlaying(true), () => setPlaying(false));
      else setPlaying(true);
      return;
    }
    const { index: line, offsetMs } = locateRadioTime(ep.timeline, positionRef.current);
    cueLine(line, offsetMs, true);
  }, [cueLine, goTo, status]);

  const previous = useCallback(() => {
    if (positionRef.current > RADIO_RESTART_MS || indexRef.current === 0) seekTo(0);
    else goTo(indexRef.current - 1, true);
  }, [goTo, seekTo]);

  const next = useCallback(() => {
    if (indexRef.current + 1 < queueRef.current.length) goTo(indexRef.current + 1, true);
  }, [goTo]);

  const cycleSpeed = useCallback(() => {
    const value = nextRadioSpeed(speedRef.current);
    speedRef.current = value;
    setSpeed(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const controlsRef = useRef({
    cue: cueLine,
    advance: (autoplay: boolean) => goTo(indexRef.current + 1, autoplay),
    toggle,
    pause,
    previous,
    next,
    seekBy: (delta: number) => seekTo(positionRef.current + delta),
  });
  controlsRef.current = {
    cue: cueLine,
    advance: (autoplay: boolean) => goTo(indexRef.current + 1, autoplay),
    toggle,
    pause,
    previous,
    next,
    seekBy: (delta: number) => seekTo(positionRef.current + delta),
  };

  // Bölümün sesi: yalnız önbellekten (409 `not_cached` → atlanır, kredi yok).
  useEffect(() => {
    if (!currentId) {
      // Atlanan son bölümden sonra liste bitmiştir; hiç çalınacak bölüm kalmadıysa boştur.
      setEpisode(null);
      setStatus((value) => (value === "finished" || queueRef.current.length ? "finished" : "empty"));
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    setEpisode(null);
    setPositionMs(0);
    void (async () => {
      try {
        const res = await fetch(PREP_RADIO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, podcastId: currentId }),
          signal: controller.signal,
        });
        if (res.status === 409 || res.status === 404) {
          toast.message(PREP_RADIO_SKIPPED);
          setQueue((list) => list.filter((item) => item.id !== currentId));
          return;
        }
        const data = (await res.json().catch(() => null)) as { item?: RadioItem; lines?: unknown } | null;
        const tracks = validTracks(data?.lines);
        if (!res.ok || !tracks.length) {
          setStatus("error");
          return;
        }
        const item = queueRef.current.find((entry) => entry.id === currentId) ?? data?.item ?? null;
        if (!item) return;
        setEpisode({ item, tracks, timeline: radioTimeline(tracks) });
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    })();
    return () => controller.abort();
  }, [currentId, nonce, prepId]);

  // Bölüm hazır: istenen yerden başlar (kendiliğinden ilerlerken çalarak).
  useEffect(() => {
    if (status !== "ready" || !episode) return;
    const { index: line, offsetMs } = locateRadioTime(episode.timeline, pendingSeekRef.current);
    pendingSeekRef.current = 0;
    cueLine(line, offsetMs, autoplayRef.current);
  }, [cueLine, episode, status]);

  // Kilit ekranı / kulaklık denetimleri.
  const mediaTitle = episode?.item.title ?? current?.title ?? PREP_RADIO_NAME;
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    return bindRadioMediaSession(
      navigator,
      { title: mediaTitle, artist: "Cortex Plus", album: `${PREP_RADIO_NAME} · ${prepTitle}` },
      {
        play: () => {
          if (!playingRef.current) controlsRef.current.toggle();
        },
        pause: () => controlsRef.current.pause(),
        previous: () => controlsRef.current.previous(),
        next: () => controlsRef.current.next(),
        seekBackward: () => controlsRef.current.seekBy(-RADIO_SKIP_MS),
        seekForward: () => controlsRef.current.seekBy(RADIO_SKIP_MS),
      },
    );
  }, [mediaTitle, prepTitle]);

  useEffect(() => {
    if (typeof navigator !== "undefined") setRadioPlaybackState(navigator, playing);
  }, [playing]);

  // Çubuk açıkken sayfa altındaki sabit kart ve sayfanın sonu çubuğun üstünde kalır (`prep-radio.css`).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.cxRadio = "open";
    const bar = barRef.current;
    const measure = () => {
      if (bar) root.style.setProperty("--cx-radio-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "function" && bar ? new ResizeObserver(measure) : null;
    if (observer && bar) observer.observe(bar);
    playButtonRef.current?.focus();
    return () => {
      observer?.disconnect();
      delete root.dataset.cxRadio;
      root.style.removeProperty("--cx-radio-h");
    };
  }, []);

  // Kapanınca ses durur.
  useEffect(
    () => () => {
      tokenRef.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      preloadRef.current?.removeAttribute("src");
    },
    [],
  );

  const total = episode?.timeline.totalMs ?? 0;
  const pct = total > 0 ? Math.min(100, Math.max(0, (positionMs / total) * 100)) : 0;
  const ready = status === "ready" && Boolean(episode);
  const title =
    status === "empty"
      ? PREP_RADIO_EMPTY
      : status === "finished"
        ? PREP_RADIO_FINISHED
        : status === "error"
          ? PREP_RADIO_FAILED
          : mediaTitle;
  const kickerParts = [PREP_RADIO_NAME, queue.length ? `${Math.min(index + 1, queue.length)} / ${queue.length}` : null];
  if (ready) kickerParts.push(`${formatRadioClock(positionMs)} / ${formatRadioClock(total)}`);
  const canPlay = ready || status === "finished";

  return (
    <div id={id} ref={barRef} className="cp-prep-radio-bar" role="region" aria-label={PREP_RADIO_NAME} data-status={status}>
      <div className="cp-prep-radio-progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="cp-prep-radio-info">
        <p className="cp-prep-radio-kicker">
          <Headphones aria-hidden />
          <span>{kickerParts.filter(Boolean).join(" · ")}</span>
        </p>
        <p className="cp-prep-radio-title" aria-live="polite">
          {title}
        </p>
        {status === "error" ? (
          <button type="button" className="cp-prep-radio-retry" onClick={() => setNonce((value) => value + 1)}>
            Yeniden dene
          </button>
        ) : null}
      </div>
      <div className="cp-prep-radio-controls" role="group" aria-label="Radyo denetimleri">
        <button
          type="button"
          className="cp-prep-radio-btn cp-prep-radio-speed cx-glass"
          aria-label={`Hız: ${radioSpeedLabel(speed)}`}
          title="Hızı değiştir"
          onClick={cycleSpeed}
        >
          {radioSpeedLabel(speed)}
        </button>
        <button
          type="button"
          className="cp-prep-radio-btn cx-glass"
          aria-label="Önceki bölüm"
          title="Önceki bölüm"
          disabled={!ready}
          onClick={previous}
        >
          <SkipBack aria-hidden />
        </button>
        <button
          type="button"
          className="cp-prep-radio-btn cp-prep-radio-skip cx-glass"
          aria-label="15 saniye geri"
          title="15 saniye geri"
          disabled={!ready}
          onClick={() => seekTo(positionRef.current - RADIO_SKIP_MS)}
        >
          <RotateCcw aria-hidden />
          <span aria-hidden>15</span>
        </button>
        <button
          ref={playButtonRef}
          type="button"
          className="cp-prep-radio-btn cp-prep-radio-play cx-glass"
          aria-label={status === "loading" ? "Yükleniyor" : playing ? "Duraklat" : "Oynat"}
          aria-busy={status === "loading" || undefined}
          disabled={!canPlay}
          onClick={toggle}
        >
          {status === "loading" ? <LoaderCircle className="cp-prep-radio-spin" aria-hidden /> : playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button
          type="button"
          className="cp-prep-radio-btn cp-prep-radio-skip cx-glass"
          aria-label="15 saniye ileri"
          title="15 saniye ileri"
          disabled={!ready}
          onClick={() => seekTo(positionRef.current + RADIO_SKIP_MS)}
        >
          <RotateCw aria-hidden />
          <span aria-hidden>15</span>
        </button>
        <button
          type="button"
          className="cp-prep-radio-btn cx-glass"
          aria-label="Sonraki bölüm"
          title="Sonraki bölüm"
          disabled={!ready || index + 1 >= queue.length}
          onClick={next}
        >
          <SkipForward aria-hidden />
        </button>
      </div>
      <button type="button" className="cp-prep-radio-close" aria-label="Radyoyu kapat" title="Radyoyu kapat" onClick={onClose}>
        <X aria-hidden />
      </button>
    </div>
  );
}
