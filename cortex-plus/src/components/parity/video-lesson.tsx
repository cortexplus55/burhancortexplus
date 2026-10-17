"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Expand, Loader2, Pause, Play, RotateCcw, RotateCw, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STARS_CHANGED_EVENT } from "@/components/parity/stars-dialog";
import { VIDEO_STYLES, captionChunks, type VideoStyle } from "@/lib/learning/video-lesson";
import "@/styles/video-lesson.css";

type Topic = { id: string; label: string };

/**
 * Video kurulumu (Astra: "Video — 1 dakikalık video dersi izle — Hızlı ve görsel —
 * Videoyu ayarla" → "Video stili" → "Konu seç" → hazırlanıyor). Yalnız Plus.
 */
export function VideoLessonSetup({
  prepId,
  entitled,
  topics,
  initialTopicId,
  previous,
}: {
  prepId: string;
  entitled: boolean;
  topics: Topic[];
  initialTopicId: string | null;
  previous: { id: string; title: string; topicLabel: string; styleLabel: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "style" | "topic" | "making">("intro");
  const [style, setStyle] = useState<VideoStyle>("whiteboard");
  const [line, setLine] = useState(0);
  const lines = ["Senaryo yazılıyor…", "Kaynakla karşılaştırılıyor…", "Sahneler çiziliyor…", "Seslendiriliyor…", "Video birleştiriliyor…"];

  useEffect(() => {
    if (step !== "making") return;
    const id = window.setInterval(() => setLine((value) => Math.min(lines.length - 1, value + 1)), 9000);
    return () => window.clearInterval(id);
  }, [step, lines.length]);

  async function make(topicId: string) {
    setStep("making");
    setLine(0);
    try {
      const res = await fetch("/api/learning/exam-prep/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, topicId, style, clientRequestId: crypto.randomUUID() }),
      });
      const body = (await res.json().catch(() => ({}))) as { videoId?: string; error?: string };
      if (res.status === 402) {
        toast.error(body.error === "insufficient_credits" ? "Bu ayki hakkın video için yetmiyor." : "Video ders Plus'ta.");
        setStep("intro");
        return;
      }
      if (!res.ok || !body.videoId) throw new Error();
      router.replace(`/deneme-sinavlari/${prepId}/video?v=${body.videoId}`);
    } catch {
      toast.error("Video şu an hazırlanamadı. Hakkın iade edildi.");
      setStep("topic");
    }
  }

  if (step === "making") {
    return (
      <section className="cp-video-setup cp-video-making" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        <h1>Videon hazırlanıyor…</h1>
        <ul>
          {lines.map((text, index) => (
            <li key={text} className={cn(index < line && "is-done", index === line && "is-now")}>
              {text}
            </li>
          ))}
        </ul>
        <p>Bu işlem bir iki dakika sürebilir.</p>
      </section>
    );
  }

  if (step === "style") {
    return (
      <section className="cp-video-setup" aria-labelledby="video-style-title">
        <h1 id="video-style-title">Video stili</h1>
        <p className="cp-video-lead">Dersinin görünümünü seç</p>
        <ul className="cp-video-styles">
          {VIDEO_STYLES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={style === item.id}
                className={cn("cp-video-style", style === item.id && "is-on")}
                onClick={() => setStyle(item.id)}
              >
                <span className="cp-video-style-emoji" aria-hidden>
                  {item.emoji}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.blurb}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="cp-video-primary"
          onClick={() => {
            const preset = initialTopicId && topics.some((topic) => topic.id === initialTopicId) ? initialTopicId : null;
            if (preset) void make(preset);
            else setStep("topic");
          }}
        >
          Konu seç
        </button>
      </section>
    );
  }

  if (step === "topic") {
    return (
      <section className="cp-video-setup" aria-labelledby="video-topic-title">
        <h1 id="video-topic-title">Konu seç</h1>
        <ol className="cp-video-topics">
          {topics.map((topic, index) => (
            <li key={topic.id}>
              <button type="button" onClick={() => void make(topic.id)}>
                <span className="cp-video-topic-n">{index + 1}</span>
                {topic.label}
              </button>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className="cp-video-setup" aria-labelledby="video-intro-title">
      <div className="cp-video-hero">
        <span className="cp-video-hero-icon" aria-hidden>
          <Smartphone className="h-8 w-8" />
        </span>
        <h1 id="video-intro-title">Video</h1>
        <p className="cp-video-lead">1 dakikalık video dersi izle</p>
        <p className="cp-video-sub">Hızlı ve görsel</p>
      </div>
      {entitled ? (
        <>
          <button type="button" className="cp-video-primary" onClick={() => setStep("style")}>
            Videoyu ayarla
          </button>
          <p className="cp-video-note">Bir video, aylık hakkından bir dersten daha fazlasını kullanır.</p>
        </>
      ) : (
        <div className="cp-video-locked">
          <strong>{"Video ders Plus'ta"}</strong>
          <span>Konunu 1 dakikalık, çizimli ve anlatımlı bir videoyla özetle.</span>
          <Link href="/pay" className="cp-video-primary">
            {"Plus'a geç"}
          </Link>
        </div>
      )}
      {previous.length ? (
        <section className="cp-video-previous" aria-label="Önceki videoların">
          <h2>Önceki videoların</h2>
          <ul>
            {previous.map((item) => (
              <li key={item.id}>
                <Link href={`/deneme-sinavlari/${prepId}/video?v=${item.id}`}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.topicLabel} · {item.styleLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

type PlayerScene = { narration: string; durationMs: number; imageUrl: string; audioUrl: string };

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Dikey video oynatıcı (Astra'daki gibi): üstte başlık, "1 kaynak", "Dersi tamamla";
 * ortada ±15 sn ve oynat; altta ilerleme, süre, hız, tam ekran. Sahne resmi yavaşça
 * yakınlaşır, alt yazı 2-4 kelimelik parçalarla akar, ses sahne sahne çalar.
 */
export function VideoLessonPlayer({
  prepId,
  videoId,
  title,
  topicLabel,
  styleLabel,
  completed,
  scenes,
}: {
  prepId: string;
  videoId: string;
  title: string;
  topicLabel: string;
  styleLabel: string;
  completed: boolean;
  scenes: PlayerScene[];
}) {
  const router = useRouter();
  const frame = useRef<HTMLDivElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [scene, setScene] = useState(0);
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [finishing, setFinishing] = useState(false);
  const pendingSeek = useRef<number | null>(null);

  const starts = useMemo(() => {
    const list: number[] = [];
    let sum = 0;
    for (const item of scenes) {
      list.push(sum);
      sum += item.durationMs;
    }
    return { list, total: sum };
  }, [scenes]);
  const chunks = useMemo(() => scenes.map((item) => captionChunks(item.narration, item.durationMs)), [scenes]);
  const current = scenes[scene];
  const elapsed = (starts.list[scene] ?? 0) + offset;
  const caption = chunks[scene]?.find((chunk) => offset >= chunk.startMs && offset < chunk.endMs)?.text ?? chunks[scene]?.at(-1)?.text ?? "";

  useEffect(() => {
    const el = audio.current;
    if (!el || !current) return;
    el.src = current.audioUrl;
    el.playbackRate = speed;
    el.currentTime = (pendingSeek.current ?? 0) / 1000;
    pendingSeek.current = null;
    if (playing) void el.play().catch(() => setPlaying(false));
    // Sahne değişince yalnız kaynak değişir; oynatma durumu korunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, current?.audioUrl]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (ended) {
      setEnded(false);
      pendingSeek.current = 0;
      setScene(0);
      setOffset(0);
      setPlaying(true);
      if (scene === 0) {
        el.currentTime = 0;
        void el.play().catch(() => setPlaying(false));
      }
      return;
    }
    if (el.paused) {
      // Ses yüklenirken düğme hemen "Duraklat" olsun; yoksa yavaş bağlantıda ikinci dokunuş durdurur.
      setPlaying(true);
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }, [ended, scene]);

  const seekTo = useCallback(
    (globalMs: number) => {
      const target = Math.max(0, Math.min(starts.total - 1, globalMs));
      let index = starts.list.findIndex((start, i) => target >= start && target < start + (scenes[i]?.durationMs ?? 0));
      if (index < 0) index = scenes.length - 1;
      const within = target - (starts.list[index] ?? 0);
      setEnded(false);
      setOffset(within);
      if (index === scene && audio.current) {
        audio.current.currentTime = within / 1000;
      } else {
        pendingSeek.current = within;
        setScene(index);
      }
    },
    [scene, scenes, starts],
  );

  function fullscreen() {
    const el = frame.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  async function finish() {
    setFinishing(true);
    try {
      const res = await fetch("/api/learning/exam-prep/video/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const body = (await res.json().catch(() => ({}))) as { stars?: number };
      if ((body.stars ?? 0) > 0) {
        toast.success(`+${body.stars} yıldız`);
        window.dispatchEvent(new Event(STARS_CHANGED_EVENT));
      }
    } catch {
      // Tamamlama kaydı düşse de öğrenci yoluna döner.
    } finally {
      router.push(`/deneme-sinavlari/${prepId}`);
    }
  }

  return (
    <div className="cp-video-page">
      <Link href={`/deneme-sinavlari/${prepId}`} className="cp-video-close" aria-label="Kapat">
        <X className="h-5 w-5" aria-hidden />
      </Link>
      <div ref={frame} className="cp-video-frame">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- imzalı depo adresi
          <img key={scene} src={current.imageUrl} alt="" className={cn("cp-video-image", playing && "is-moving")} />
        ) : null}
        <div className="cp-video-top">
          <p className="cp-video-title">{title}</p>
          <p className="cp-video-meta">
            {topicLabel} · {styleLabel} · 1 kaynak
          </p>
          <button type="button" className="cp-video-finish" disabled={finishing} onClick={() => void finish()}>
            {completed ? "Yola dön" : "Dersi tamamla"}
          </button>
        </div>
        {caption ? (
          <p className="cp-video-caption" aria-live="off">
            {caption}
          </p>
        ) : null}
        <div className={cn("cp-video-center", playing && "is-hidden")}>
          <button type="button" aria-label="15 saniye geri" onClick={() => seekTo(elapsed - 15000)}>
            <RotateCcw className="h-5 w-5" aria-hidden />
            <span>15</span>
          </button>
          <button type="button" className="cp-video-play" aria-label={playing ? "Duraklat" : "Oynat"} onClick={toggle}>
            {playing ? <Pause className="h-7 w-7" aria-hidden /> : <Play className="h-7 w-7" aria-hidden />}
          </button>
          <button type="button" aria-label="15 saniye ileri" onClick={() => seekTo(elapsed + 15000)}>
            <RotateCw className="h-5 w-5" aria-hidden />
            <span>15</span>
          </button>
        </div>
        <button type="button" className="cp-video-tap" aria-hidden tabIndex={-1} onClick={toggle} />
      </div>
      <div className="cp-video-bar">
        <span className="cp-video-time">{mmss(elapsed)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, starts.total)}
          value={Math.min(elapsed, starts.total)}
          aria-label="İlerleme"
          onChange={(event) => seekTo(Number(event.target.value))}
        />
        <span className="cp-video-time">{mmss(starts.total)}</span>
        <button
          type="button"
          className="cp-video-speed"
          aria-label="Hız"
          onClick={() => setSpeed((value) => SPEEDS[(SPEEDS.indexOf(value) + 1) % SPEEDS.length]!)}
        >
          {speed}x
        </button>
        <button type="button" className="cp-video-icon" aria-label="Tam ekran" onClick={fullscreen}>
          <Expand className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <details className="cp-video-script">
        <summary>Anlatımın metni</summary>
        <ol>
          {scenes.map((item, index) => (
            <li key={index}>{item.narration}</li>
          ))}
        </ol>
      </details>
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={(event) => setOffset(event.currentTarget.currentTime * 1000)}
        onEnded={() => {
          if (scene + 1 < scenes.length) {
            pendingSeek.current = 0;
            setOffset(0);
            setScene(scene + 1);
          } else {
            setPlaying(false);
            setEnded(true);
          }
        }}
      />
    </div>
  );
}
