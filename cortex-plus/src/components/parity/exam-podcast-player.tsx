"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
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

// Plan: 10 sn atlama; 15 sn bir cümleyi atlıyordu.
const SKIP_MS = 10_000;
const SPEEDS = [1, 1.25, 1.5, 2] as const;

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

  // Ses üretimi bir defalık: aynı cümleler sunucuda önbellekli olduğu için
  // ikinci açılışta anında geliyor.
  useEffect(() => {
    tokenRef.current += 1;
    elementRef.current?.pause();
    setAudio(null);
    setPlaying(false);
    setPositionMs(0);
    setHeard(false);
    setStatus("loading");
    if (!normalized.length) {
      setStatus("fallback");
      return;
    }
    let alive = true;
    const controller = new AbortController();
    void fetch("/api/learning/podcast/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapters: normalized }),
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
        return res.json();
      })
      .then((data: { lines?: AudioLine[] }) => {
        if (!alive) return;
        const verified = validatePodcastAudio(normalized, data.lines);
        if (!verified) throw new Error("unavailable");
        setAudio(verified);
        setStatus("ready");
      })
      .catch((error: Error) => {
        // Hangi sebep olursa olsun ders sessiz kalmasın diye tarayıcı sesine
        // dönüyoruz; orada zaman çizelgesi olmadığı için senkron kapanıyor.
        if (!alive) return;
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
  }, [normalized]);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      elementRef.current?.pause();
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
      element.playbackRate = speed;
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
    [audio, timeline, totalMs, speed],
  );

  useEffect(() => {
    if (elementRef.current) elementRef.current.playbackRate = speed;
  }, [speed]);

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
    const index = Math.max(0, lineAt(timeline, positionMs));
    const start = timeline[index]?.startMs ?? 0;
    playFromLine(index, positionMs - start);
  }

  if (!normalized.length) {
    return (
      <p className="text-sm text-[var(--cp-muted)]">
        Bu podcast henüz üretilemedi.
      </p>
    );
  }

  const chapterTitle =
    normalized[timeline[activeIndex]?.chapterIndex ?? 0]?.title ?? "";
  const progressPct = totalMs > 0 ? (positionMs / totalMs) * 100 : 0;

  return (
    <section className="cp-pod">
      <header className="cp-pod-head">
        <p className="cp-lesson-kicker">Podcast</p>
        <h1>{title}</h1>
        {status === "ready" && chapterTitle ? (
          <p className="cp-pod-chapter-now">{chapterTitle}</p>
        ) : null}
      </header>

      <div className="cp-pod-stage">
        <div className={cn("cp-pod-wave", playing && "is-on")} aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>

        <div className="cp-pod-controls">
          <button
            type="button"
            className="cp-pod-skip"
            onClick={() => seekTo(positionMs - SKIP_MS)}
            disabled={status !== "ready"}
            aria-label="10 saniye geri"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
            <em>10</em>
          </button>

          <button
            type="button"
            className={cn("cp-pod-play", playing && "is-on")}
            onClick={toggle}
            disabled={status !== "ready"}
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
            className="cp-pod-skip"
            onClick={() => seekTo(positionMs + SKIP_MS)}
            disabled={status !== "ready"}
            aria-label="10 saniye ileri"
          >
            <RotateCw className="h-5 w-5" aria-hidden />
            <em>10</em>
          </button>
        </div>

        {status === "ready" ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5" role="group" aria-label="Oynatma hızı">
            {SPEEDS.map((rate) => (
              <button
                key={rate}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  speed === rate
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
                    : "border-white/15 text-[var(--cp-muted)]",
                )}
                onClick={() => setSpeed(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
        ) : null}

        {status === "loading" ? (
          <p className="cp-pod-state">Ses hazırlanıyor…</p>
        ) : status === "premium" ? (
          <p className="cp-pod-state">
            Bu seslendirme için hakkın yetmedi. Bölümleri aşağıdan
            okuyabilirsin.{" "}
            <Link href="/krediler" className="cp-pod-upsell">
              Hakkını gör
            </Link>
          </p>
        ) : status === "credits" ? (
          <p className="cp-pod-state">
            Bu ayki seslendirme kredin kalmadı. Bölümleri aşağıdan
            okuyabilirsin.{" "}
            <Link href="/paketler" className="cp-pod-upsell">
              Kredi ekle
            </Link>
          </p>
        ) : status === "fallback" ? (
          <p className="cp-pod-state">
            Ses şu an üretilemedi. Bölümleri aşağıdan okuyabilirsin.
          </p>
        ) : (
          <div className="cp-pod-track">
            <input
              type="range"
              min={0}
              max={Math.max(1, totalMs)}
              value={Math.round(positionMs)}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Ses konumu"
              style={{ ["--cp-pod-pos" as string]: `${progressPct}%` }}
            />
            <div className="cp-pod-time">
              <span>{formatClock(positionMs)}</span>
              <span>{formatClock(totalMs)}</span>
            </div>
          </div>
        )}
      </div>

      {status === "ready" ? (
        <ol className="cp-pod-transcript">
          {timeline.map((line, i) => {
            const first =
              i === 0 || timeline[i - 1].chapterIndex !== line.chapterIndex;
            return (
              <li key={i}>
                {first ? (
                  <p className="cp-pod-chapter-mark">
                    {normalized[line.chapterIndex]?.title}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "cp-pod-line",
                    `cp-pod-line--${line.speaker}`,
                    i === activeIndex && "is-on",
                  )}
                  onClick={() => seekTo(line.startMs)}
                >
                  <span className="cp-pod-who">{SPEAKER_LABEL[line.speaker]}</span>
                  {i === activeIndex && activeWords.length ? (
                    // Yalnızca çalan satır kelimelere bölünüyor; tüm
                    // transkripti bölmek yüzlerce gereksiz span üretirdi.
                    <span className="cp-pod-said">
                      {activeWords.map((word, w) => (
                        <span
                          key={w}
                          className={cn(
                            "cp-pod-word",
                            w === activeWordIndex && "is-now",
                            w < activeWordIndex && "is-said",
                          )}
                        >
                          {word.text}{" "}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="cp-pod-said">{line.text}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="cp-pod-transcript">
          {normalized.map((chapter, ci) => (
            <li key={ci}>
              <p className="cp-pod-chapter-mark">{chapter.title}</p>
              {chapter.lines.map((line, li) => (
                <span
                  key={li}
                  className={cn("cp-pod-line", `cp-pod-line--${line.speaker}`)}
                >
                  <span className="cp-pod-who">{SPEAKER_LABEL[line.speaker]}</span>
                  <span className="cp-pod-said">{line.text}</span>
                </span>
              ))}
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="cp-exam-continue cp-exam-continue--primary"
        disabled={finishing}
        onClick={onFinish}
      >
        {finishing ? "Kaydediliyor…" : heard ? "Dinledim, devam" : "Devam et"}
      </button>
    </section>
  );
}
