"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlignLeft, ChevronLeft, Download, Pause, Play, SkipBack, X } from "lucide-react";
import {
  SPEAKER_LABEL,
  buildTimeline,
  formatClock,
  lineAt,
  normalizeChapters,
  totalDurationMs,
  wordAt,
  wordTimings,
  type SpeakerId,
  type TimedLine,
} from "@/lib/learning/podcast-script";
import { cn } from "@/lib/utils";
import { validatePodcastAudio } from "@/lib/learning/podcast-audio-contract";

type AudioLine = {
  chapterIndex: number;
  speaker: SpeakerId;
  text: string;
  url: string;
  durationMs: number;
};

// Astra oynatıcısı 15 sn atlıyor ve düğmenin üstünde 15 yazıyor.
// Etiket ile atlama aynı olsun; 10 sn'lik eski adım chrome'da 15 gibi duruyordu.
const SKIP_MS = 15_000;
const SPEEDS = [1, 1.25, 1.5, 2] as const;

function SkipSeconds({ direction }: { direction: "back" | "forward" }) {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <g transform={direction === "forward" ? "translate(40 0) scale(-1 1)" : undefined}>
        <path
          d="M26.5 13.2a10.2 10.2 0 1 0 1.6 7.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M26.2 8.6v6.1h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x="20"
        y="23.2"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="currentColor"
      >
        15
      </text>
    </svg>
  );
}

function padClock(ms: number): string {
  const [minutes, seconds] = formatClock(ms).split(":");
  return `${(minutes ?? "0").padStart(2, "0")}:${seconds ?? "00"}`;
}

function scriptHeading(title: string, chapterTitle: string): string {
  const generic = /^(podcast|podcast dinle)$/i.test(title.trim());
  return generic && chapterTitle ? chapterTitle : title;
}

export function ExamPodcastPlayer({
  title,
  chapters,
  onFinish,
  onClose,
  finishing,
  embed = false,
  resumeKey,
}: {
  title: string;
  chapters: unknown[];
  onFinish: () => void;
  /** Sağ üst X. Verilmezse kapatma düğmesi çizilmez. */
  onClose?: () => void;
  finishing?: boolean;
  /** Sonuç ekranındaki "Şimdi dinle" — tam sayfa yüksekliği zorlamasın. */
  embed?: boolean;
  /** Aynı hazırlık ve konuda kaldığı yerden devam. */
  resumeKey?: string;
}) {
  const normalized = useMemo(() => normalizeChapters(chapters), [chapters]);
  const [audio, setAudio] = useState<(AudioLine | null)[] | null>(null);
  const [progress, setProgress] = useState({ ready: 0, total: 0 });
  /*
    Üç "ses yok" hâli ayrı tutuluyor; hepsinde senaryo okunabilir kalıyor ama
    öğrenciye söylenen cümle farklı. Herkese "sunucu sesi şu an yok" demek
    premium özelliğini arıza gibi gösterirdi; kredisi biten bir PLUS
    ABONESİNE "Plus'a bak" demek de olmazdı.

    18 Eylül 2026: tarayıcı sesi yedeği KALKTI. Podcast ya iki sesli gerçek
    anlatımıyla vardır ya yoktur — telefonun robot sesi, ürünün en cazip
    özelliğini ucuz gösteriyordu ve onu hiç duymamış öğrenci duyduğunu ürün
    sanıyordu. Ses gelmediğinde artık senaryo okunuyor, sebebi yazıyor.
  */
  const [status, setStatus] = useState<
    "loading" | "ready" | "fallback" | "premium" | "credits"
  >("loading");
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [heard, setHeard] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [transcript, setTranscript] = useState(false);

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(0);
  const tokenRef = useRef(0);
  const scriptRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<(AudioLine | null)[]>([]);
  const expectedRef = useRef(0);
  const completeRef = useRef(false);
  const waitingRef = useRef(false);
  const playRef = useRef<(index: number, offsetMs?: number) => void>(() => {});
  const timelineRef = useRef<TimedLine[]>([]);
  const totalRef = useRef(0);

  const timeline: TimedLine[] = useMemo(
    () => buildTimeline(normalized, (audio ?? []).map((line) => line?.durationMs ?? 0)),
    [normalized, audio],
  );
  const totalMs = totalDurationMs(timeline);
  const located = playing || positionMs > 0 ? lineAt(timeline, positionMs) : 0;
  const activeIndex = located < 0 ? Math.max(0, timeline.length - 1) : located;

  // Kelime vurgusu yalnızca çalan cümle için hesaplanıyor. Cümle sınırları
  // gerçek ses süresinden geliyor; cümle içi dağılım tahmin (bkz. wordTimings).
  const activeLine = timeline[activeIndex];
  const activeWords = useMemo(
    () =>
      activeLine
        ? wordTimings(activeLine.text, activeLine.endMs - activeLine.startMs)
        : [],
    [activeLine],
  );
  const activeWordIndex = activeLine
    ? wordAt(activeWords, positionMs - activeLine.startMs)
    : -1;
  timelineRef.current = timeline;
  totalRef.current = totalMs;

  // Ses üretimi bir defalık: aynı cümleler sunucuda önbellekli olduğu için
  // ikinci açılışta anında geliyor.
  useEffect(() => {
    tokenRef.current += 1;
    elementRef.current?.pause();
    setAudio(null);
    setProgress({ ready: 0, total: 0 });
    linesRef.current = [];
    expectedRef.current = 0;
    completeRef.current = false;
    waitingRef.current = false;
    setPlaying(false);
    setPositionMs(0);
    setHeard(false);
    setStatus("loading");
    if (!normalized.length) {
      setStatus("fallback");
      return;
    }
    let alive = true;
    let started = false;
    const controller = new AbortController();
    const place = (index: number, line: AudioLine, total: number) => {
      if (!alive || index < 0) return;
      const next = linesRef.current.slice();
      if (next.length < total) next.length = total;
      next[index] = line;
      linesRef.current = next;
      expectedRef.current = total;
      const ready = next.filter(Boolean).length;
      setAudio(next);
      setProgress({ ready, total });
      if (!started && index === 0) {
        started = true;
        setStatus("ready");
        const saved = resumeKey ? Number(window.localStorage.getItem(`cp-pod-pos:${resumeKey}`)) : 0;
        if (!(Number.isFinite(saved) && saved > 800)) playRef.current(0);
      } else if (waitingRef.current && index === indexRef.current) {
        waitingRef.current = false;
        playRef.current(index);
      }
    };
    void fetch("/api/learning/podcast/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapters: normalized, stream: true }),
      signal: controller.signal,
    })
      .then(async (res) => {
        // 402 iki ayrı sebeple geliyor ve ikisi de arıza değil: aboneliği
        // olmayan öğrenci ile kredisi biten abone. Ayrım yanıttaki `code`
        // alanından; Türkçe metni karşılaştırmak, metni değiştiren ilk
        // kişide sessizce kırılırdı.
        if (res.status === 402) {
          const body = (await res.json().catch(() => null)) as
            | { code?: string }
            | null;
          throw new Error(
            body?.code === "insufficient_credits" ? "credits" : "premium",
          );
        }
        if (!res.ok) throw new Error("unavailable");
        const reader = res.body?.getReader();
        if (!reader) throw new Error("unavailable");
        const decoder = new TextDecoder();
        let buffer = "";
        while (alive) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.trim()) continue;
            const event = JSON.parse(part) as {
              type?: string;
              code?: string;
              index?: number;
              total?: number;
              chapterIndex?: number;
              speaker?: AudioLine["speaker"];
              text?: string;
              url?: string;
              durationMs?: number;
              lines?: AudioLine[];
            };
            if (event.type === "error") {
              throw new Error(event.code === "insufficient_credits" ? "credits" : "unavailable");
            }
            if (event.type === "line" && event.url && event.durationMs && event.speaker && event.text != null && event.index != null) {
              place(event.index, {
                chapterIndex: event.chapterIndex ?? 0,
                speaker: event.speaker,
                text: event.text,
                url: event.url,
                durationMs: event.durationMs,
              }, event.total ?? expectedRef.current);
            }
            if (event.type === "done" && event.lines) {
              const verified = validatePodcastAudio(normalized, event.lines);
              if (!verified) throw new Error("unavailable");
              linesRef.current = verified;
              expectedRef.current = verified.length;
              completeRef.current = true;
              setAudio(verified);
              setProgress({ ready: verified.length, total: verified.length });
              if (!started && verified[0]) {
                started = true;
                setStatus("ready");
                playRef.current(0);
              }
            }
          }
        }
        if (alive && !completeRef.current && !linesRef.current.some(Boolean)) {
          throw new Error("unavailable");
        }
        completeRef.current = true;
      })
      .catch((error: Error) => {
        // Hangi sebep olursa olsun ders sessiz kalmasın diye senaryo
        // açık kalıyor; zaman çizelgesi olmadığı için senkron kapanıyor.
        if (!alive) return;
        if (linesRef.current.some(Boolean) && error.message !== "credits" && error.message !== "premium") {
          completeRef.current = true;
          setStatus("ready");
          return;
        }
        setStatus(
          error.message === "premium" || error.message === "credits"
            ? error.message
            : "fallback",
        );
      });
    return () => {
      alive = false;
      controller.abort();
      tokenRef.current += 1;
      elementRef.current?.pause();
    };
  }, [normalized, resumeKey]);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      elementRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!transcript) return;
    const node = scriptRef.current?.querySelector(".is-now");
    if (node && "scrollIntoView" in node) {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [transcript, activeWordIndex, activeIndex]);

  const playFromLine = useCallback(
    (index: number, offsetMs = 0) => {
      const line = linesRef.current[index];
      if (!line) {
        waitingRef.current = true;
        indexRef.current = index;
        if (completeRef.current) {
          setPlaying(false);
          setHeard(true);
        }
        return;
      }

      const token = ++tokenRef.current;
      indexRef.current = index;
      waitingRef.current = false;

      let element = elementRef.current;
      if (!element) {
        element = new Audio();
        elementRef.current = element;
      }
      element.pause();
      element.src = line.url;
      element.playbackRate = speed;
      element.preload = "auto";
      element.setAttribute("playsinline", "true");
      const startAt = Math.max(0, offsetMs) / 1000;
      const arm = () => {
        if (token !== tokenRef.current) return;
        if (Number.isFinite(element!.duration) && startAt < element!.duration) {
          element!.currentTime = startAt;
        }
      };
      element.onloadedmetadata = arm;
      if (element.readyState >= 1) arm();

      element.ontimeupdate = () => {
        if (token !== tokenRef.current) return;
        const start = timelineRef.current[index]?.startMs ?? 0;
        setPositionMs(start + element!.currentTime * 1000);
      };
      element.onended = () => {
        if (token !== tokenRef.current) return;
        const total = expectedRef.current || linesRef.current.length;
        const nextLine = linesRef.current[index + 1];
        if (index + 1 >= total && completeRef.current) {
          setPlaying(false);
          setHeard(true);
          setPositionMs(totalRef.current);
          return;
        }
        const hold = timelineRef.current[index]?.beat === "ask" ? 4_000 : 0;
        const advance = () => {
          if (token !== tokenRef.current) return;
          if (!linesRef.current[index + 1]) {
            waitingRef.current = true;
            indexRef.current = index + 1;
            if (completeRef.current) {
              setPlaying(false);
              setHeard(true);
            }
            return;
          }
          playRef.current(index + 1);
        };
        if (hold) {
          window.setTimeout(advance, hold);
          return;
        }
        if (!nextLine) {
          advance();
          return;
        }
        playRef.current(index + 1);
      };

      void element.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );

      const next = linesRef.current[index + 1];
      if (next) {
        const pre = preloadRef.current ?? new Audio();
        pre.preload = "auto";
        pre.src = next.url;
        preloadRef.current = pre;
      }
    },
    [speed],
  );
  playRef.current = playFromLine;

  useEffect(() => {
    if (elementRef.current) elementRef.current.playbackRate = speed;
  }, [speed]);

  const resumeStorageKey = resumeKey ? `cp-pod-pos:${resumeKey}` : null;
  const resumedRef = useRef(false);
  const savedSecondRef = useRef(-1);

  useEffect(() => {
    if (!resumeStorageKey || status !== "ready" || progress.total === 0 || progress.ready < progress.total || resumedRef.current) return;
    resumedRef.current = true;
    const saved = Number(window.localStorage.getItem(resumeStorageKey));
    if (Number.isFinite(saved) && saved > 800 && saved < totalMs - 800) {
      setPositionMs(saved);
    }
  }, [resumeStorageKey, status, totalMs, progress.ready, progress.total]);

  useEffect(() => {
    if (!resumeStorageKey || positionMs < 800) return;
    const second = Math.floor(positionMs / 1000);
    if (savedSecondRef.current === second) return;
    savedSecondRef.current = second;
    window.localStorage.setItem(resumeStorageKey, String(Math.round(positionMs)));
  }, [resumeStorageKey, positionMs]);

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
    // Ses yoksa oynatacak bir şey de yok; düğme zaten kapalı.
    if (!audio) return;
    if (playing) {
      tokenRef.current += 1;
      elementRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (totalMs > 0 && positionMs >= totalMs - 80) {
      seekTo(0);
      return;
    }
    const index = Math.max(0, lineAt(timeline, positionMs));
    const start = timeline[index]?.startMs ?? 0;
    playFromLine(index, positionMs - start);
  }

  function skipPrevious() {
    if (!audio || !timeline.length) return;
    const index = Math.max(0, located < 0 ? timeline.length - 1 : located);
    const chapter = timeline[index]?.chapterIndex ?? 0;
    const chapterStart =
      timeline.find((line) => line.chapterIndex === chapter)?.startMs ?? 0;
    if (positionMs - chapterStart > 2000) {
      seekTo(chapterStart);
      return;
    }
    const prev = timeline.find((line) => line.chapterIndex === chapter - 1);
    seekTo(prev?.startMs ?? 0);
  }

  function cycleSpeed() {
    const index = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(index + 1) % SPEEDS.length]);
  }

  const controlsRef = useRef({ toggle, seekTo, cycleSpeed });
  controlsRef.current = { toggle, seekTo, cycleSpeed };
  const positionRef = useRef(0);
  positionRef.current = positionMs;
  const playingRef = useRef(false);
  playingRef.current = playing;

  useEffect(() => {
    if (status !== "ready" || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title,
      artist: "Cortex Plus",
      album: "Podcast",
    });
    const bind = (action: MediaSessionAction, run: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, run);
      } catch {
        // Bu tarayıcı eylemi tanımıyor.
      }
    };
    bind("play", () => {
      if (!playingRef.current) controlsRef.current.toggle();
    });
    bind("pause", () => {
      if (!playingRef.current) return;
      tokenRef.current += 1;
      elementRef.current?.pause();
      setPlaying(false);
    });
    bind("seekbackward", () => controlsRef.current.seekTo(positionRef.current - SKIP_MS));
    bind("seekforward", () => controlsRef.current.seekTo(positionRef.current + SKIP_MS));
    return () => {
      bind("play", null);
      bind("pause", null);
      bind("seekbackward", null);
      bind("seekforward", null);
    };
  }, [status, title]);

  async function downloadEpisode() {
    const transcriptText = normalized
      .map((chapter) => `${chapter.title}\n${chapter.lines.map((line) => line.text).join("\n")}`)
      .join("\n\n");
    const save = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    };
    const safeName = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "podcast";
    if (audio?.length && audio.every((line) => line?.url)) {
      try {
        const blobs = await Promise.all(
          audio.map(async (line) => {
            const res = await fetch(line!.url);
            if (!res.ok) throw new Error("audio");
            return res.blob();
          }),
        );
        save(new Blob(blobs, { type: "audio/mpeg" }), `${safeName}.mp3`);
        return;
      } catch {
        // Ses dosyası tarayıcıdan birleşmezse transkript iner.
      }
    }
    save(new Blob([transcriptText], { type: "text/plain;charset=utf-8" }), `${safeName}.txt`);
  }

  if (!normalized.length) {
    // Bölüm yoksa Astra oynatıcısı çizilmez. Kapatma yine durur;
    // oturum da bu durumda çalışma çubuğunu açık bırakır.
    return (
      <section className="cp-pod cp-pod--empty">
        <header className="cp-pod-top">
          <span aria-hidden />
          <p className="cp-pod-kicker">Podcast</p>
          {onClose ? (
            <button type="button" className="cp-pod-x" onClick={onClose} aria-label="Kapat">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span aria-hidden />
          )}
        </header>
        <p className="cp-pod-state">Bu podcast henüz üretilemedi.</p>
      </section>
    );
  }

  const chapterTitle =
    normalized[timeline[activeIndex]?.chapterIndex ?? 0]?.title ?? "";
  const heading = scriptHeading(title, chapterTitle);
  const excerpt = activeLine?.text || normalized[0]?.lines[0]?.text || "";
  const progressPct = totalMs > 0 ? (positionMs / totalMs) * 100 : 0;
  const ready = status === "ready";

  const chaptersInOrder = normalized.map((chapter, chapterIndex) => ({
    chapter,
    lines: timeline
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.chapterIndex === chapterIndex),
  }));

  return (
    <section className={cn("cp-pod", transcript && "cp-pod--script", embed && "cp-pod--embed")}>
      <header className="cp-pod-top">
        {transcript ? (
          <button
            type="button"
            className="cp-pod-back"
            onClick={() => setTranscript(false)}
            aria-label="Oynatıcıya dön"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <span aria-hidden />
        )}
        {transcript ? <span aria-hidden /> : <p className="cp-pod-kicker">Podcast</p>}
        {onClose && !transcript ? (
          <button type="button" className="cp-pod-x" onClick={onClose} aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span aria-hidden />
        )}
      </header>

      <div className="cp-pod-body">
        {transcript ? (
          <article className="cp-pod-script-col">
            <h1 className="cp-pod-script-title">{heading}</h1>
            <div className="cp-pod-script" ref={scriptRef}>
              {chaptersInOrder.map(({ chapter, lines }, chapterIndex) => (
                <section key={chapterIndex}>
                  <h2>
                    <button
                      type="button"
                      className="cp-pod-chapter-jump"
                      disabled={!ready}
                      onClick={() => seekTo(lines[0]?.line.startMs ?? 0)}
                    >
                      {chapter.title}
                    </button>
                  </h2>
                  <div className="cp-pod-script-lines">
                  {lines.map(({ line, index }) => (
                    <span key={index}>
                      <span className="cp-pod-who-sr">
                        {chaptersInOrder.every(({ lines: chapterLines }) =>
                          chapterLines.every((item) => item.line.speaker === "ada"),
                        )
                          ? "Öğretmen"
                          : SPEAKER_LABEL[line.speaker]}
                        :{" "}
                      </span>
                      <button
                        type="button"
                        className="cp-pod-line-jump"
                        disabled={!ready}
                        onClick={() => seekTo(line.startMs)}
                      >
                      {ready && index === activeIndex && activeWords.length ? (
                        activeWords.map((word, wordIndex) => (
                          <span
                            key={wordIndex}
                            className={cn(
                              "cp-pod-word",
                              wordIndex === activeWordIndex && "is-now",
                              wordIndex < activeWordIndex && "is-said",
                            )}
                          >
                            {word.text}{" "}
                          </span>
                        ))
                      ) : (
                        <span
                          className={cn(
                            "cp-pod-said",
                            ready && index === activeIndex && "is-line",
                          )}
                        >
                          {line.text}{" "}
                        </span>
                      )}
                      </button>
                    </span>
                  ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        ) : (
          <>
            <div className={cn("cp-pod-orb", playing && "is-on")} aria-hidden>
              <span className="cp-pod-orb-ring" />
            </div>
            {activeLine?.beat === "ask" ? <p className="cp-pod-beat">Dur ve düşün</p> : null}
            <p className="cp-pod-excerpt">{excerpt}</p>
            <nav className="cp-pod-chapters" aria-label="Bölümler">
              {normalized.map((chapter, chapterIndex) => {
                const start =
                  timeline.find((line) => line.chapterIndex === chapterIndex)?.startMs ?? 0;
                const current = (timeline[activeIndex]?.chapterIndex ?? 0) === chapterIndex;
                return (
                  <button
                    key={chapter.title + chapterIndex}
                    type="button"
                    className={cn("cp-pod-chapter", current && "is-on")}
                    disabled={!ready}
                    onClick={() => seekTo(start)}
                  >
                    {chapter.title}
                  </button>
                );
              })}
            </nav>
            <div className="cp-pod-tools">
              <button
                type="button"
                className="cp-pod-script-btn"
                onClick={() => setTranscript(true)}
              >
                <AlignLeft className="h-3.5 w-3.5" aria-hidden />
                Tam transkript
              </button>
              <button type="button" className="cp-pod-script-btn" onClick={() => void downloadEpisode()}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                İndir
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="cp-pod-dock">
        {status === "loading" || (status === "ready" && progress.total > progress.ready) ? (
          <p className="cp-pod-state">
            Ses hazırlanıyor…{progress.total > 0 ? ` ${progress.ready}/${progress.total}` : ""}
          </p>
        ) : status === "premium" ? (
          <p className="cp-pod-state">
            Bu seslendirme için hakkın yetmedi. Bölümleri transkriptten
            okuyabilirsin.{" "}
            <Link href="/krediler" className="cp-pod-upsell">
              Hakkını gör
            </Link>
          </p>
        ) : status === "credits" ? (
          <p className="cp-pod-state">
            Bu ayki seslendirme kredin kalmadı. Bölümleri transkriptten
            okuyabilirsin.{" "}
            <Link href="/paketler" className="cp-pod-upsell">
              Kredi ekle
            </Link>
          </p>
        ) : status === "fallback" ? (
          <p className="cp-pod-state">
            Ses şu an üretilemedi. Bölümleri transkriptten okuyabilirsin.
          </p>
        ) : null}

        <div className="cp-pod-controls">
          <button
            type="button"
            className="cp-pod-prev"
            onClick={skipPrevious}
            disabled={!ready}
            aria-label="Önceki bölüm"
          >
            <SkipBack className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className="cp-pod-skip"
            onClick={() => seekTo(positionMs - SKIP_MS)}
            disabled={!ready}
            aria-label="15 saniye geri"
          >
            <SkipSeconds direction="back" />
          </button>
          <button
            type="button"
            className={cn("cp-pod-play", playing && "is-on")}
            onClick={toggle}
            disabled={status !== "ready"}
            aria-label={playing ? "Duraklat" : "Oynat"}
          >
            {playing ? (
              <Pause className="h-6 w-6" fill="currentColor" />
            ) : (
              <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="cp-pod-skip"
            onClick={() => seekTo(positionMs + SKIP_MS)}
            disabled={!ready}
            aria-label="15 saniye ileri"
          >
            <SkipSeconds direction="forward" />
          </button>
          <button
            type="button"
            className="cp-pod-rate"
            onClick={cycleSpeed}
            disabled={!ready}
            aria-label={`Oynatma hızı, şu an ${speed}x`}
          >
            {speed}x
          </button>
        </div>

        <div className="cp-pod-track">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalMs)}
            value={Math.min(Math.round(positionMs), Math.max(1, totalMs))}
            onChange={(event) => seekTo(Number(event.target.value))}
            disabled={!ready}
            aria-label="Ses konumu"
            style={{ ["--cp-pod-pos" as string]: `${progressPct}%` }}
          />
          <div className="cp-pod-time">
            <span>{padClock(positionMs)}</span>
            <span>{padClock(totalMs)}</span>
          </div>
        </div>

        <button
          type="button"
          className={cn("cp-pod-finish", heard && "is-heard")}
          disabled={finishing}
          onClick={onFinish}
        >
          {finishing ? "Kaydediliyor…" : heard ? "Dinledim, devam" : "Devam et"}
        </button>
      </footer>
    </section>
  );
}
