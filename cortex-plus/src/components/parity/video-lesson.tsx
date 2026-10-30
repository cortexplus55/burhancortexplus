"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Expand, Loader2, Pause, Play, RotateCcw, RotateCw, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { postJsonWithRetry } from "@/lib/learning/generation-retry";
import { STARS_CHANGED_EVENT } from "@/components/parity/stars-dialog";
import { DiagramCard } from "@/components/parity/diagram-card";
import { formulaStepHtml } from "@/lib/learning/math-text";
import { studentOutputText } from "@/lib/learning/student-output-firewall";
import {
  VIDEO_STYLES,
  captionChunks,
  sketchFormulaSteps,
  speechText,
  type SketchDiagram,
  type VideoStyle,
} from "@/lib/learning/video-lesson";
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
  initialMode = "image",
  previous,
}: {
  prepId: string;
  entitled: boolean;
  topics: Topic[];
  initialTopicId: string | null;
  initialMode?: "image" | "sketch_reel";
  previous: { id: string; title: string; topicLabel: string; styleLabel: string }[];
}) {
  const router = useRouter();
  const sketchEntry = initialMode === "sketch_reel";
  const [step, setStep] = useState<"intro" | "style" | "topic" | "making">(
    sketchEntry && entitled && initialTopicId ? "making" : sketchEntry && entitled ? "topic" : "intro",
  );
  const [style, setStyle] = useState<VideoStyle>("cinematic");
  const [sketchJob, setSketchJob] = useState(sketchEntry);
  const [line, setLine] = useState(0);
  const lines = sketchJob
    ? ["Senaryo yazılıyor…", "Şema ve formül kuruluyor…", "Sesler birlikte üretiliyor…", "Video birleştiriliyor…"]
    : ["Senaryo yazılıyor…", "Kaynakla karşılaştırılıyor…", "Sahneler çiziliyor…", "Seslendiriliyor…", "Video birleştiriliyor…"];
  const sketchStarted = useRef(false);

  useEffect(() => {
    if (step !== "making") return;
    const id = window.setInterval(() => setLine((value) => Math.min(lines.length - 1, value + 1)), sketchJob ? 5000 : 9000);
    return () => window.clearInterval(id);
  }, [step, lines.length, sketchJob]);

  useEffect(() => {
    if (!sketchEntry || !entitled || !initialTopicId || sketchStarted.current) return;
    const lock = `cp-sketch:${prepId}:${initialTopicId}`;
    const previous = Number(window.sessionStorage.getItem(lock) || 0);
    if (Date.now() - previous < 15_000) return;
    sketchStarted.current = true;
    window.sessionStorage.setItem(lock, String(Date.now()));
    void make(initialTopicId, "sketch_reel");
    // Konu bağlantısı üretimi bir kez açar. Kısa kilit, katı modun ikinci kurulumunu keser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchEntry, entitled, initialTopicId, prepId]);

  async function make(topicId: string, chosen: VideoStyle | "sketch_reel" = style) {
    const sketch = chosen === "sketch_reel";
    setSketchJob(sketch);
    setStep("making");
    setLine(0);
    try {
      // Üretim düşünce bir kez kendiliğinden, yeni istek kimliğiyle (19 Ekim 2026).
      const { res, data: body } = await postJsonWithRetry<{ videoId?: string; error?: string; code?: string }>(
        "/api/learning/exam-prep/video",
        () => ({
          prepId,
          topicId,
          style: chosen,
          mode: sketch ? "sketch_reel" : "image",
          clientRequestId: crypto.randomUUID(),
        }),
      );
      if (res.status === 402) {
        if (sketch) window.sessionStorage.removeItem(`cp-sketch:${prepId}:${topicId}`);
        toast.error(body.error === "insufficient_credits" ? "Bu ayki hakkın video için yetmiyor." : "Video ders Plus'ta.");
        setStep("intro");
        return;
      }
      if (!res.ok || !body.videoId) throw new Error();
      router.replace(`/deneme-sinavlari/${prepId}/video?v=${body.videoId}`);
    } catch {
      if (sketch) window.sessionStorage.removeItem(`cp-sketch:${prepId}:${topicId}`);
      toast.error("Video bu sefer gelmedi. İki kez denedik. Hakkın iade edildi, birkaç saniye sonra yeniden dene.");
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
        <p>{sketchJob ? "Yaklaşık yarım dakika sürer." : "Bu işlem bir iki dakika sürebilir."}</p>
      </section>
    );
  }

  if (step === "style") {
    // Konudan gelindiyse (hazırlık yolu, araç seçici) konu sorulmaz: düğme bunu söylesin
    // (19 Ekim 2026; "Konu seç" yazıp doğrudan üretime geçiyordu).
    const presetTopic = initialTopicId ? topics.find((topic) => topic.id === initialTopicId) ?? null : null;
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
            if (presetTopic) void make(presetTopic.id, style);
            else setStep("topic");
          }}
        >
          {presetTopic ? "Videoyu oluştur" : "Konu seç"}
        </button>
        {presetTopic ? <p className="cp-video-note">Konu: {presetTopic.label}</p> : null}
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
              <button type="button" onClick={() => void make(topic.id, sketchEntry ? "sketch_reel" : style)}>
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

type PlayerScene = {
  narration: string;
  durationMs: number;
  imageUrl: string;
  audioUrl: string;
  keyFact?: string;
  sceneTitle?: string;
  formula?: string;
  diagram?: SketchDiagram;
};

type FrameRatio = "9:16" | "16:9";

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
  scenes: rawScenes,
}: {
  prepId: string;
  videoId: string;
  title: string;
  topicLabel: string;
  styleLabel: string;
  completed: boolean;
  scenes: PlayerScene[];
}) {
  // Öğrenciye giden metnin tek süzgeci (30 Ekim 2026, Paket I #5): video alt yazısı ve kilit bilgi de geçer.
  const scenes = useMemo(
    () =>
      rawScenes.map((item) => ({
        ...item,
        narration: studentOutputText(item.narration),
        ...(item.keyFact ? { keyFact: studentOutputText(item.keyFact) } : {}),
      })),
    [rawScenes],
  );
  const router = useRouter();
  const frame = useRef<HTMLDivElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [scene, setScene] = useState(0);
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [finishing, setFinishing] = useState(false);
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState<FrameRatio>("9:16");
  const pendingSeek = useRef<number | null>(null);
  const prevSceneRef = useRef(0);

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
  const captionChunk = chunks[scene]?.find((chunk) => offset >= chunk.startMs && offset < chunk.endMs) ?? chunks[scene]?.at(-1);
  const caption = captionChunk?.text ?? "";
  const sketch = Boolean(current?.diagram) && !current?.imageUrl;
  const draw = current && current.durationMs > 0 ? Math.max(0, Math.min(1, offset / current.durationMs)) : 0;
  const formulaSteps = current?.formula ? sketchFormulaSteps(current.formula) : [];
  const formulaShown = formulaSteps.length ? Math.max(1, Math.ceil(draw * formulaSteps.length)) : 0;

  useEffect(() => {
    if (prevSceneRef.current === scene) return;
    const previous = scenes[prevSceneRef.current];
    prevSceneRef.current = scene;
    if (!previous?.imageUrl) return;
    setOutgoingUrl(previous.imageUrl);
    const timer = window.setTimeout(() => setOutgoingUrl(null), 700);
    return () => window.clearTimeout(timer);
  }, [scene, scenes]);

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
      <div className="cp-video-ratio" role="group" aria-label="Görünüm oranı">
        <button type="button" aria-pressed={ratio === "9:16"} onClick={() => setRatio("9:16")}>
          📱 Dikey (9:16)
        </button>
        <button type="button" aria-pressed={ratio === "16:9"} onClick={() => setRatio("16:9")}>
          🖥️ Yatay (16:9)
        </button>
      </div>
      <div ref={frame} className={cn("cp-video-frame", ratio === "16:9" ? "is-landscape" : "is-portrait")} data-ratio={ratio}>
        {sketch && current?.diagram ? (
          <SketchBoard
            key={scene}
            title={current.sceneTitle || title}
            diagram={current.diagram}
            sceneKey={scene}
            draw={draw}
            playing={playing}
            formulaSteps={formulaSteps}
            formulaShown={formulaShown}
            keyFact={current.keyFact}
          />
        ) : (
          <>
            {outgoingUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imzalı depo adresi
              <img src={outgoingUrl} alt="" className="cp-video-image is-fade-out" />
            ) : null}
            {current?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imzalı depo adresi
              <img
                key={scene}
                src={current.imageUrl}
                alt=""
                className={cn("cp-video-image", `is-kb-${scene % 4}`, playing && "is-moving")}
              />
            ) : null}
          </>
        )}
        <div className="cp-video-top">
          <p className="cp-video-title">{title}</p>
          <p className="cp-video-meta">
            {topicLabel} · {styleLabel} · 1 kaynak
          </p>
          <button type="button" className="cp-video-finish" disabled={finishing} onClick={() => void finish()}>
            {completed ? "Yola dön" : "Dersi tamamla"}
          </button>
        </div>
        {/* Kilit bilgi (18 Ekim 2026): sınavda sorulacak sayı ya da kural resmin üstünde büyük ve renkli;
            resim yazısız kalır, yazıyı oynatıcı çizer. */}
        {/* Çizimli sahnede kilit bilgi tahtanın akışında (SketchBoard): üstte durunca "Dersi tamamla" düğmesine ve
            sahne başlığına biniyordu (30 Ekim 2026, canlı tur). */}
        {current?.keyFact && !sketch ? (
          <p key={`fact-${scene}`} className="cp-video-fact">
            {current.keyFact}
          </p>
        ) : null}
        {caption ? (
          <p className="cp-video-caption" aria-live="off">
            {captionChunk?.words.map((item, index) => (
              <span key={index} className={item.key ? "cp-video-key" : undefined}>
                {index ? " " : ""}
                {item.word}
              </span>
            )) ?? caption}
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
            <li key={index}>{speechText(item.narration)}</li>
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

function SketchBoard({
  title,
  diagram,
  sceneKey,
  draw,
  playing,
  formulaSteps,
  formulaShown,
  keyFact,
}: {
  title: string;
  diagram: SketchDiagram;
  sceneKey: number;
  draw: number;
  playing: boolean;
  formulaSteps: string[];
  formulaShown: number;
  keyFact?: string;
}) {
  return (
    <div
      className={cn("cp-video-board", playing && "is-playing")}
      style={{ ["--draw" as string]: String(draw) }}
      data-sketch="reel"
    >
      <div className="cp-video-board-body">
        <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {title}
        </motion.h2>
        {keyFact ? <p className="cp-video-fact cp-sketch-fact">{keyFact}</p> : null}
        <motion.div
          className="cp-sketch-stage"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.08 }}
        >
          <DiagramCard
            id={`sketch-${sceneKey}`}
            card={{
              type: "diagram_card",
              diagramKind: diagram.diagramKind,
              title: diagram.title,
              ...(diagram.caption ? { caption: diagram.caption } : {}),
              items: diagram.items,
            }}
          />
        </motion.div>
        {formulaSteps.length ? (
          <div className="cp-sketch-formulas">
            {formulaSteps.map((step, index) => (
              <motion.p
                key={`${sceneKey}-${index}`}
                className={cn("cp-sketch-formula", index < formulaShown ? "is-on" : "is-wait")}
                initial={{ opacity: 0 }}
                animate={{ opacity: index < formulaShown ? 1 : 0.18 }}
                transition={{ duration: 0.3 }}
                dangerouslySetInnerHTML={{ __html: formulaStepHtml(step) }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
