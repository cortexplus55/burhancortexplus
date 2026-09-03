"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import {
  SPEAKER_LABEL,
  buildTimeline,
  formatClock,
  lineAt,
  normalizeChapters,
  totalDurationMs,
  type SpeakerId,
  type TimedLine,
} from "@/lib/learning/podcast-script";
import { cn } from "@/lib/utils";

type AudioLine = {
  chapterIndex: number;
  speaker: SpeakerId;
  text: string;
  url: string;
  durationMs: number;
};

const SKIP_MS = 10_000;

export function ExamPodcastPlayer({
  title,
  chapters,
  onFinish,
  finishing,
}: {
  title: string;
  chapters: unknown[];
  onFinish: () => void;
  finishing?: boolean;
}) {
  const normalized = useMemo(() => normalizeChapters(chapters), [chapters]);
  const [audio, setAudio] = useState<AudioLine[] | null>(null);
  // "premium" ile "fallback" ayrı: ikisi de tarayıcı sesine düşüyor ama
  // sebepleri farklı ve öğrenciye farklı şey söylenmeli. Gating geldikten
  // sonra herkese "sunucu sesi şu an yok" demek, premium özelliğini arıza
  // gibi göstermek olurdu.
  const [status, setStatus] = useState<
    "loading" | "ready" | "fallback" | "premium"
  >("loading");
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [heard, setHeard] = useState(false);

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(0);
  const tokenRef = useRef(0);

  const timeline: TimedLine[] = useMemo(
    () => buildTimeline(normalized, (audio ?? []).map((line) => line.durationMs)),
    [normalized, audio],
  );
  const totalMs = totalDurationMs(timeline);
  const activeIndex = playing || positionMs > 0 ? lineAt(timeline, positionMs) : 0;

  // Ses üretimi bir defalık: aynı cümleler sunucuda önbellekli olduğu için
  // ikinci açılışta anında geliyor.
  useEffect(() => {
    if (!normalized.length) {
      setStatus("fallback");
      return;
    }
    let alive = true;
    void fetch("/api/learning/podcast/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapters: normalized }),
    })
      .then(async (res) => {
        // 402 = premium gerekiyor; arıza değil, o yüzden ayrı işaretleniyor.
        if (res.status === 402) throw new Error("premium");
        if (!res.ok) throw new Error("unavailable");
        return res.json();
      })
      .then((data: { lines?: AudioLine[] }) => {
        if (!alive) return;
        if (!data.lines?.length) throw new Error("unavailable");
        setAudio(data.lines);
        setStatus("ready");
      })
      .catch((error: Error) => {
        // Her iki durumda da ders sessiz kalmasın diye tarayıcı sesine
        // dönüyoruz; orada zaman çizelgesi olmadığı için senkron kapanıyor.
        if (alive) setStatus(error.message === "premium" ? "premium" : "fallback");
      });
    return () => {
      alive = false;
    };
  }, [normalized]);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      elementRef.current?.pause();
      stopSpeech();
    };
  }, []);

  const playFromLine = useCallback(
    (index: number, offsetMs = 0) => {
      const lines = audio;
      if (!lines) return;
      const line = lines[index];
      if (!line) {
        setPlaying(false);
        setHeard(true);
        return;
      }

      const token = ++tokenRef.current;
      indexRef.current = index;

      let element = elementRef.current;
      if (!element) {
        element = new Audio();
        elementRef.current = element;
      }
      element.pause();
      element.src = line.url;
      element.currentTime = Math.max(0, offsetMs) / 1000;

      element.ontimeupdate = () => {
        if (token !== tokenRef.current) return;
        const start = timeline[index]?.startMs ?? 0;
        setPositionMs(start + element!.currentTime * 1000);
      };
      element.onended = () => {
        if (token !== tokenRef.current) return;
        if (index + 1 >= lines.length) {
          setPlaying(false);
          setHeard(true);
          setPositionMs(totalMs);
          return;
        }
        playFromLine(index + 1);
      };

      void element.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );

      // Sonraki cümleyi önden yükle ki cümleler arası boşluk duyulmasın.
      const next = lines[index + 1];
      if (next) {
        const pre = preloadRef.current ?? new Audio();
        pre.preload = "auto";
        pre.src = next.url;
        preloadRef.current = pre;
      }
    },
    [audio, timeline, totalMs],
  );

  function seekTo(ms: number) {
    if (!audio) return;
    const clamped = Math.max(0, Math.min(ms, Math.max(0, totalMs - 1)));
    const index = Math.max(0, lineAt(timeline, clamped));
    const start = timeline[index]?.startMs ?? 0;
    setPositionMs(clamped);
    setHeard(false);
    playFromLine(index, clamped - start);
  }

  function toggle() {
    if (status === "fallback" || status === "premium") {
      toggleFallback();
      return;
    }
    if (!audio) return;
    if (playing) {
      tokenRef.current += 1;
      elementRef.current?.pause();
      setPlaying(false);
      return;
    }
    const index = Math.max(0, lineAt(timeline, positionMs));
    const start = timeline[index]?.startMs ?? 0;
    playFromLine(index, positionMs - start);
  }

  function toggleFallback() {
    if (playing) {
      stopSpeech();
      setPlaying(false);
      return;
    }
    const script = normalized
      .flatMap((chapter) => chapter.lines.map((line) => line.text))
      .join(" ");
    setPlaying(true);
    speakTurkish(script, () => {
      setPlaying(false);
      setHeard(true);
    });
  }

  if (!normalized.length) {
    return (
      <p className="text-sm text-[var(--ap-muted)]">
        Bu podcast henüz üretilemedi.
      </p>
    );
  }

  const chapterTitle =
    normalized[timeline[activeIndex]?.chapterIndex ?? 0]?.title ?? "";
  const progressPct = totalMs > 0 ? (positionMs / totalMs) * 100 : 0;

  return (
    <section className="ap-pod">
      <header className="ap-pod-head">
        <p className="ap-lesson-kicker">Podcast</p>
        <h1>{title}</h1>
        {status === "ready" && chapterTitle ? (
          <p className="ap-pod-chapter-now">{chapterTitle}</p>
        ) : null}
      </header>

      <div className="ap-pod-stage">
        <div className={cn("ap-pod-wave", playing && "is-on")} aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>

        <div className="ap-pod-controls">
          <button
            type="button"
            className="ap-pod-skip"
            onClick={() => seekTo(positionMs - SKIP_MS)}
            disabled={status !== "ready"}
            aria-label="10 saniye geri"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
            <em>10</em>
          </button>

          <button
            type="button"
            className={cn("ap-pod-play", playing && "is-on")}
            onClick={toggle}
            disabled={status === "loading"}
            aria-label={playing ? "Duraklat" : "Oynat"}
          >
            {playing ? (
              <Pause className="h-7 w-7" />
            ) : (
              <Play className="h-7 w-7 translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            className="ap-pod-skip"
            onClick={() => seekTo(positionMs + SKIP_MS)}
            disabled={status !== "ready"}
            aria-label="10 saniye ileri"
          >
            <RotateCw className="h-5 w-5" aria-hidden />
            <em>10</em>
          </button>
        </div>

        {status === "loading" ? (
          <p className="ap-pod-state">Ses hazırlanıyor…</p>
        ) : status === "premium" ? (
          <p className="ap-pod-state">
            İki sesli stüdyo anlatımı Plus&apos;a özel — şimdilik cihazının
            sesiyle okunuyor.{" "}
            <Link href="/paketler" className="ap-pod-upsell">
              Plus&apos;a bak
            </Link>
          </p>
        ) : status === "fallback" ? (
          <p className="ap-pod-state">
            Sunucu sesi şu an yok; cihazının sesiyle okunuyor.
          </p>
        ) : (
          <div className="ap-pod-track">
            <input
              type="range"
              min={0}
              max={Math.max(1, totalMs)}
              value={Math.round(positionMs)}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Ses konumu"
              style={{ ["--ap-pod-pos" as string]: `${progressPct}%` }}
            />
            <div className="ap-pod-time">
              <span>{formatClock(positionMs)}</span>
              <span>{formatClock(totalMs)}</span>
            </div>
          </div>
        )}
      </div>

      {status === "ready" ? (
        <ol className="ap-pod-transcript">
          {timeline.map((line, i) => {
            const first =
              i === 0 || timeline[i - 1].chapterIndex !== line.chapterIndex;
            return (
              <li key={i}>
                {first ? (
                  <p className="ap-pod-chapter-mark">
                    {normalized[line.chapterIndex]?.title}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "ap-pod-line",
                    `ap-pod-line--${line.speaker}`,
                    i === activeIndex && "is-on",
                  )}
                  onClick={() => seekTo(line.startMs)}
                >
                  <span className="ap-pod-who">{SPEAKER_LABEL[line.speaker]}</span>
                  <span className="ap-pod-said">{line.text}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="ap-pod-transcript">
          {normalized.map((chapter, ci) => (
            <li key={ci}>
              <p className="ap-pod-chapter-mark">{chapter.title}</p>
              {chapter.lines.map((line, li) => (
                <span
                  key={li}
                  className={cn("ap-pod-line", `ap-pod-line--${line.speaker}`)}
                >
                  <span className="ap-pod-who">{SPEAKER_LABEL[line.speaker]}</span>
                  <span className="ap-pod-said">{line.text}</span>
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="ap-exam-continue ap-exam-continue--primary"
        disabled={finishing}
        onClick={onFinish}
      >
        {finishing ? "Kaydediliyor…" : heard ? "Dinledim, devam" : "Devam et"}
      </button>
    </section>
  );
}
