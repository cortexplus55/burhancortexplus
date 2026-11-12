"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { CramSheetView } from "@/components/parity/cram-sheet-view";
import { PodcastKaraokeLine } from "@/components/parity/podcast-karaoke";
import { SketchBoard } from "@/components/parity/video-lesson";
import { TOUR_LESSON, TOUR_PODCAST_SAMPLE, TOUR_PREP, TOUR_SKETCH } from "@/lib/demo/guest-tour";
import { buildCramSheet } from "@/lib/learning/cram-sheet";
import { captionChunks, sketchFormulaSteps } from "@/lib/learning/video-lesson";
import { JOURNEY_PLUS_PLAY, type JourneyPlusPreviewId } from "@/lib/marketing/landing-journey";
import { cn } from "@/lib/utils";
import "@/styles/parity-shell.css";
import "@/styles/tour-product.css";
import "@/styles/tour-previews.css";

/**
 * Kokpitin Plus adımındaki canlı önizlemeler (11 Kasım 2026). Kuru metin kutuları yerine ürünün kendi parçaları:
 *
 *   podcast → gerçek bir bölümün sesinden kısa bir kesit; kelime vurgusunu ürünün karaoke bileşeni çizer
 *   video   → ürünün çizim tahtası (`SketchBoard`) ve alt yazı parçalayıcısı; ses yerine bir sayaç sürer
 *   kâğıt   → ürünün derleyicisi (`buildCramSheet`) turdaki örnek dersten çıkarır, ürünün görünümü çizer
 *
 * Hiçbiri model çağırmaz, sunucuya istek atmaz: ses depoda sabit bir dosyadır, tahta ve kâğıt tarayıcıda hesaplanır.
 * Dosya ana sayfanın ilk yükünde yoktur; ziyaretçi Plus adımına yaklaşınca ayrı parça olarak yüklenir.
 */

export type TourPlusPreviewProps = { preview: JourneyPlusPreviewId };

/** Önizleme uygulamanın kendi kabuk sınıflarının içinde çizilir: parçalar üründeki renk ve ölçüleri alır. */
export function TourPlusPreview({ preview }: TourPlusPreviewProps) {
  return (
    <div className="tp-app dark cp-sor-root cp-sor-root--session tpp-shell" data-preview-shell={preview}>
      {preview === "podcast" ? <PodcastPreview /> : null}
      {preview === "video" ? <VideoPreview /> : null}
      {preview === "sheet" ? <SheetPreview /> : null}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function clockLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* ---------- Podcast ---------- */

const WAVE_BARS = 28;

/**
 * Gerçek bölümden kesit. Ses çalarken saat sesin konumudur; ses yüklenemezse (ağ, engellenen oynatma) kelimeler
 * duvar saatiyle sessiz akar ve ekran bunu söyler: ziyaretçi boş bir düğmeye bakmaz.
 */
function PodcastPreview() {
  const sample = TOUR_PODCAST_SAMPLE;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const position = useRef(0);
  const wall = useRef({ startedAt: 0, base: 0 });
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      const now = silent || !audio ? wall.current.base + (performance.now() - wall.current.startedAt) : audio.currentTime * 1000;
      if (now >= sample.durationMs) {
        position.current = sample.durationMs;
        setMs(sample.durationMs);
        setPlaying(false);
        return;
      }
      position.current = now;
      setMs(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, silent, sample.durationMs]);

  // Adımdan çıkılınca ses susar.
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  function goSilent() {
    wall.current = { startedAt: performance.now(), base: position.current };
    setSilent(true);
  }

  function toggle() {
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    const from = position.current >= sample.durationMs ? 0 : position.current;
    position.current = from;
    setMs(from);
    wall.current = { startedAt: performance.now(), base: from };
    setPlaying(true);
    if (silent || !audio) return;
    try {
      audio.currentTime = from / 1000;
      const started = audio.play() as Promise<void> | undefined;
      if (started && typeof started.catch === "function") started.catch(goSilent);
    } catch {
      goSilent();
    }
  }

  const ended = ms >= sample.durationMs;
  const speaking = sample.lines.find((line) => ms >= line.startMs && ms < line.endMs)?.speaker ?? null;
  const pct = Math.min(100, (ms / sample.durationMs) * 100);

  return (
    <div className={cn("tpp-pod", playing && "is-playing")} data-preview="podcast" data-speaking={playing ? speaking : undefined}>
      <div className="tpp-pod-wave" aria-hidden>
        {Array.from({ length: WAVE_BARS }, (_, bar) => (
          <span key={bar} style={{ ["--tpp-i" as string]: bar }} />
        ))}
      </div>
      <ol className="tpp-pod-lines">
        {sample.lines.map((line) => {
          const state = ms >= line.endMs ? "done" : ms > 0 && ms >= line.startMs ? "now" : playing && line.startMs === 0 ? "now" : "wait";
          return (
            <li key={line.startMs} className={cn("tpp-pod-line", `is-${state}`)} data-speaker={line.speaker}>
              <span className="tpp-pod-who">{line.name}</span>
              <span className="tpp-pod-text">
                <PodcastKaraokeLine
                  text={line.text}
                  currentTime={(ms - line.startMs) / 1000}
                  duration={(line.endMs - line.startMs) / 1000}
                  active={state === "now"}
                />
              </span>
            </li>
          );
        })}
      </ol>
      <div className="tpp-progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="tpp-controls">
        <button type="button" className="tpp-play" onClick={toggle}>
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : ended ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {playing ? JOURNEY_PLUS_PLAY.pause : ended ? JOURNEY_PLUS_PLAY.replay : JOURNEY_PLUS_PLAY.podcast}
        </button>
        <span className="tpp-time" aria-hidden>
          {clockLabel(ms)} / {clockLabel(sample.durationMs)}
        </span>
      </div>
      {silent ? (
        <p className="tpp-silent" role="status">
          {JOURNEY_PLUS_PLAY.silent} <Link href="/ornek">Örnek dersi aç</Link>
        </p>
      ) : null}
      <audio
        ref={audioRef}
        src={sample.src}
        preload="none"
        onEnded={() => {
          position.current = sample.durationMs;
          setMs(sample.durationMs);
          setPlaying(false);
        }}
        onError={() => {
          if (playing) goSilent();
          else setSilent(true);
        }}
      />
    </div>
  );
}

/* ---------- Çizimli video ---------- */

/** Sayaç adımı: tahtadaki çizgi geçişi 180 ms olduğu için saniyede on güncelleme akıcı görünür. */
const VIDEO_TICK_MS = 100;
/** Şema sahnenin ilk %70'inde çizilir, kalan sürede tamamlanmış durur. */
const DRAW_SHARE = 0.7;

/**
 * Sessiz önizleme: ürünün çizim tahtası, sesin yerine bir sayaçla. Kendiliğinden başlar ve iki sahne arasında döner;
 * hareket azaltmada çizilmiş hâliyle durur ve düğmeyle oynatılır.
 */
function VideoPreview() {
  const { scenes, sceneMs } = TOUR_SKETCH;
  const total = scenes.length * sceneMs;
  const [reduced] = useState(prefersReducedMotion);
  const position = useRef(reduced ? sceneMs - 1 : 0);
  const [elapsed, setElapsed] = useState(position.current);
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const base = position.current;
    const timer = window.setInterval(() => {
      const now = (base + (performance.now() - startedAt)) % total;
      position.current = now;
      setElapsed(now);
    }, VIDEO_TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, total]);

  const index = Math.min(scenes.length - 1, Math.floor(elapsed / sceneMs));
  const scene = scenes[index]!;
  const within = elapsed - index * sceneMs;
  const draw = Math.max(0, Math.min(1, within / (sceneMs * DRAW_SHARE)));
  const steps = useMemo(() => (scene.formula ? sketchFormulaSteps(scene.formula) : []), [scene.formula]);
  const shown = steps.length ? Math.max(1, Math.ceil(draw * steps.length)) : 0;
  const chunks = useMemo(() => captionChunks(scene.narration, sceneMs), [scene.narration, sceneMs]);
  const chunk = chunks.find((item) => within >= item.startMs && within < item.endMs) ?? chunks.at(-1);

  return (
    <div className="tpp-video" data-preview="video">
      <div className="tpp-video-slot">
        <div
          className="cp-video-frame is-portrait is-sketch tpp-video-frame"
          data-ratio="9:16"
          style={{ ["--cp-top-h" as string]: "0.4rem" }}
        >
          <SketchBoard
            key={index}
            title={scene.sceneTitle}
            diagram={scene.diagram}
            sceneKey={index}
            draw={draw}
            playing={playing}
            formulaSteps={steps}
            formulaShown={shown}
            keyFact={scene.keyFact}
          />
          {chunk ? (
            <p className="cp-video-caption" aria-live="off">
              {chunk.words.map((item, at) => (
                <span key={at} className={item.key ? "cp-video-key" : undefined}>
                  {at ? " " : ""}
                  {item.word}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      <div className="tpp-controls">
        <button type="button" className="tpp-play" onClick={() => setPlaying((current) => !current)}>
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {playing ? JOURNEY_PLUS_PLAY.pause : JOURNEY_PLUS_PLAY.video}
        </button>
        <span className="tpp-time">
          Sahne {index + 1}/{scenes.length}
        </span>
      </div>
    </div>
  );
}

/* ---------- Sınav sabahı kâğıdı ---------- */

/** Kâğıt turdaki örnek dersten, ürünün derleyicisiyle; baskıdaki gibi açık zeminde gösterilir. */
function SheetPreview() {
  const sheet = useMemo(
    () => buildCramSheet({ topics: [{ key: "tur", label: TOUR_PREP.topic }], lessons: [{ topicKey: "tur", lesson: TOUR_LESSON }] }),
    [],
  );
  return (
    <div className="tpp-sheet" data-preview="sheet">
      <div className="tpp-paper">
        <CramSheetView preview sheet={sheet} prepTitle={TOUR_PREP.title} examDay={null} homeHref="/kayit" />
      </div>
    </div>
  );
}
