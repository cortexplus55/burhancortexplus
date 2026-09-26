"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioResults,
} from "@/components/learning/studio/studio-shared";
import { CreditGate } from "@/components/paywall/credit-gate";
import {
  SPEAKER_LABEL,
  formatClock,
  normalizeChapters,
  type PodcastChapter,
} from "@/lib/learning/podcast-script";
import { cn } from "@/lib/utils";
import { validatePodcastAudio } from "@/lib/learning/podcast-audio-contract";

/**
 * Podcast stüdyosu.
 *
 * 18 Eylül 2026'da iki şey birden değişti ve ikisi aynı sorunun iki yüzüydü.
 *
 * Bu sayfa hiç GERÇEK ses çalmıyordu: senaryoyu üretip tarayıcının robot
 * sesine okutuyordu — ücretsiz kullanıcıya da, 599 TL ödeyen Plus abonesine
 * de. İki sesli stüdyo anlatımı yalnızca sınav hazırlığı oynatıcısında vardı.
 * Yani ürünün en cazip özelliğinin kendi sayfası, o özelliği kullanmıyordu.
 *
 * Şimdi: podcast kayıtlı her kademede açık ve stüdyo gerçek sesi çalıyor.
 * Robot ses yolu kalktı. Hak bitince yükseltme duvarı çıkar; özellik
 * kilitli değildir. `/ornek` hazır bölümü girişsiz ve maliyetsiz duruyor.
 *
 * 24 Eylül 2026: üretimden önce ne alınacağı yazılıyor (konu, kaynak, süre,
 * kredi), oynatıcıya 10 sn geri/ileri ve hız geldi, üretilen bölüm
 * kütüphanede kalıyor. Kütüphaneden açılan bölüm için ses satırları
 * önbellekte olduğundan yeniden dinlemek kredi düşürmüyor.
 */

type Track = { chapterIndex: number; url: string; durationMs: number };

export type PodcastLibraryItem = {
  id: string;
  title: string;
  topic: string;
  createdAt: string;
};

export type SavedEpisode = {
  id: string;
  title: string;
  tagline: string;
  topic: string;
  chapters: PodcastChapter[];
};

const SPEEDS = [1, 1.25, 1.5, 2] as const;
/** 900 karakter ≈ 1 dakika ≈ 1 kredi (bkz. audio-cache.ts). */
const CHARS_PER_MINUTE = 900;
const ESTIMATED_MINUTES = 5;

export function PodcastStudio({
  creditCost,
  initialTopic = "",
  sourceDocument = null,
  library = [],
  savedEpisode = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  /** Belge sayfasından gelindiyse senaryo yalnızca bu belgeden. */
  sourceDocument?: { id: string; fileName: string } | null;
  /** Daha önce üretilen bölümler — yeniden açılabilir. */
  library?: PodcastLibraryItem[];
  /** `?podcastId=` ile açılan kayıtlı bölüm; sese doğrudan geçer. */
  savedEpisode?: SavedEpisode | null;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "results">("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [chapters, setChapters] = useState<PodcastChapter[]>([]);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  /** Ses gelmediğinde öğrenciye söylenen tek cümle; robot sese düşmüyoruz. */
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [paywall, setPaywall] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bölüm değiştirince eski zincir susmalı; her oynatma kendi jetonunu taşıyor.
  const tokenRef = useRef(0);
  const cursorRef = useRef(0);
  const speedRef = useRef<number>(1);
  const openedSavedRef = useRef(false);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      audioRef.current?.pause();
    };
  }, []);

  // Kayıtlı bölüm: senaryo hazır, yalnızca ses isteniyor (önbellekteyse bedava).
  useEffect(() => {
    if (!savedEpisode || openedSavedRef.current) return;
    openedSavedRef.current = true;
    void openEpisode(savedEpisode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedEpisode]);

  function openPaywall() {
    setPaywall(true);
  }

  const totalMs = tracks?.reduce((sum, t) => sum + t.durationMs, 0) ?? 0;
  const trackOffsets = (() => {
    const out: number[] = [];
    let acc = 0;
    for (const t of tracks ?? []) {
      out.push(acc);
      acc += t.durationMs;
    }
    return out;
  })();

  async function fetchAudio(normalized: PodcastChapter[]) {
    const audio = await postStudio<{ lines?: Track[] }>(
      "/api/learning/podcast/audio",
      { chapters: normalized },
    );

    if ("paywall" in audio) {
      openPaywall();
      setAudioNote("Bu bölümün sesi için kredin yetmedi. Senaryoyu aşağıdan okuyabilirsin.");
      return;
    }
    if (!audio.ok || !audio.data.lines?.length) {
      setAudioNote("Ses şu an üretilemedi; kredin düşmedi. Senaryoyu aşağıdan okuyabilirsin.");
      return;
    }
    const verified = validatePodcastAudio(normalized, audio.data.lines);
    if (verified) setTracks(verified);
    else setAudioNote("Sesin tamamı doğrulanamadı. Senaryoyu aşağıdan okuyabilirsin.");
  }

  async function openEpisode(episode: SavedEpisode) {
    setPhase("loading");
    setAudioNote(null);
    setTracks(null);
    setTopic(episode.topic);
    setTitle(episode.title);
    setTagline(episode.tagline || "Kütüphaneden yeniden açıldı.");
    setChapters(episode.chapters);
    setIndex(0);
    setElapsedMs(0);
    setPlaying(false);
    await fetchAudio(episode.chapters);
    setPhase("play");
  }

  async function start(nextTopic: string) {
    setPhase("loading");
    setAudioNote(null);
    setTracks(null);
    setElapsedMs(0);

    const script = await postStudio<{
      title?: string;
      tagline?: string;
      chapters?: unknown[];
      podcastId?: string | null;
    }>("/api/learning/podcast/generate", {
      topic: nextTopic,
      ...(sourceDocument ? { documentId: sourceDocument.id } : {}),
    });

    if ("paywall" in script) {
      openPaywall();
      setPhase("entry");
      return;
    }
    if (!script.ok || !script.data.chapters?.length) {
      toast.error(
        !script.ok && script.error === "document_not_ready"
          ? "Belge henüz hazır değil ya da içi boş. Kredin düşmedi."
          : "Podcast üretilemedi. Kredin düşmedi.",
      );
      setPhase("entry");
      return;
    }

    const normalized = normalizeChapters(script.data.chapters);
    if (!normalized.length) {
      toast.error("Podcast üretilemedi.");
      setPhase("entry");
      return;
    }

    setTopic(nextTopic);
    setTitle(script.data.title ?? nextTopic);
    setTagline(script.data.tagline ?? "Kısa, konuşma dilinde bir tekrar.");
    setChapters(normalized);
    setIndex(0);
    setPlaying(false);

    /*
      Ses ayrı bir istek ve ayrı bir bedel (900 karakter = 1 kredi; önbellekten
      gelen cümle bedava). Senaryo kredisi bu noktada zaten harcandı, bu yüzden
      ses gelmese bile senaryo ekranda kalıyor — öğrenci ödediği şeyi görüyor.
      Ses üretimi başarısızsa ses kredisi sunucuda iade ediliyor
      (synthesizeCharged). Kalkan tek şey robot ses.
    */
    await fetchAudio(normalized);
    setPhase("play");
  }

  function applySpeed(element: HTMLAudioElement) {
    element.playbackRate = speedRef.current;
  }

  function playFrom(trackIndex: number, offsetSec = 0) {
    const list = tracks;
    if (!list?.length) return;

    const token = ++tokenRef.current;
    if (!audioRef.current) audioRef.current = new Audio();
    const element = audioRef.current;

    const step = (cursor: number, startAt: number) => {
      if (token !== tokenRef.current) return;
      const track = list[cursor];
      if (!track) {
        setPlaying(false);
        setPhase("results");
        return;
      }
      cursorRef.current = cursor;
      setIndex(track.chapterIndex);
      element.src = track.url;
      applySpeed(element);
      element.onloadedmetadata = () => {
        if (startAt > 0) element.currentTime = Math.min(startAt, Math.max(0, element.duration - 0.1));
      };
      element.ontimeupdate = () => {
        if (token !== tokenRef.current) return;
        setElapsedMs((trackOffsets[cursor] ?? 0) + element.currentTime * 1000);
      };
      element.onended = () => step(cursor + 1, 0);
      element.onerror = () => {
        if (token !== tokenRef.current) return;
        setPlaying(false);
        toast.error("Ses çalınamadı", {
          description: "Bağlantını kontrol edip tekrar dener misin?",
        });
      };
      void element.play().catch(() => {
        if (token !== tokenRef.current) return;
        setPlaying(false);
      });
    };

    setPlaying(true);
    step(trackIndex, offsetSec);
  }

  /** Bölümün ilk satırı — bölüm düğmeleri buraya atlıyor. */
  function firstTrackOf(chapterIndex: number) {
    const at = tracks?.findIndex((track) => track.chapterIndex === chapterIndex);
    return at === undefined || at < 0 ? 0 : at;
  }

  function toggle() {
    if (!tracks?.length) return;
    const element = audioRef.current;
    if (playing) {
      element?.pause();
      setPlaying(false);
      return;
    }
    // Duraklatılmış bir parça varsa kaldığı yerden; yoksa bulunduğu bölümden.
    if (element?.src && element.currentTime > 0 && !element.ended) {
      setPlaying(true);
      applySpeed(element);
      void element.play().catch(() => setPlaying(false));
      return;
    }
    playFrom(firstTrackOf(index));
  }

  /**
   * 10 saniye ileri/geri. Satırlar ayrı ses dosyaları olduğu için sıçrama
   * dosya sınırını aşarsa komşu satıra taşınır; zaman çizelgesi öğrenci için
   * tek bir bölüm gibi akar.
   */
  function seek(deltaSec: number) {
    const list = tracks;
    if (!list?.length) return;
    const cursor = cursorRef.current;
    const element = audioRef.current;
    const withinMs = element?.src ? element.currentTime * 1000 : 0;
    let targetMs = (trackOffsets[cursor] ?? 0) + withinMs + deltaSec * 1000;
    targetMs = Math.max(0, Math.min(targetMs, Math.max(0, totalMs - 500)));

    let target = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (targetMs < (trackOffsets[i] ?? 0) + list[i].durationMs) {
        target = i;
        break;
      }
      target = i;
    }
    const offsetSec = (targetMs - (trackOffsets[target] ?? 0)) / 1000;
    const wasPlaying = playing;
    playFrom(target, offsetSec);
    if (!wasPlaying) {
      // Duraklatılmışken sıçrama: konumu al, çalmaya başlama.
      const el = audioRef.current;
      el?.pause();
      setPlaying(false);
      setElapsedMs(targetMs);
    }
  }

  function changeSpeed(next: (typeof SPEEDS)[number]) {
    setSpeed(next);
    speedRef.current = next;
    if (audioRef.current) applySpeed(audioRef.current);
  }

  function stop() {
    tokenRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
  }

  const chapter = chapters[index];
  const progressPct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;

  return (
    <StudioFrame tool="podcast" kicker="Podcast stüdyosu">
      {phase === "entry" ? (
        <>
          <p className="ls-pod-lock">
            <a href="/ornek" className="ls-pod-lock-link">
              Örnek bölümü dinle
            </a>
          </p>
          <StudioEntry
            tool="podcast"
            title="Konuyu dinle."
            placeholder={sourceDocument ? "Örn. 3. bölüm — hücre zarı" : "Örn. Hücre bölünmesi"}
            submitLabel="Yayını hazırla"
            creditCost={creditCost}
            initialTopic={initialTopic}
            onSubmit={(next) => void start(next)}
          />

          {/* Üretimden önce ne alınacağı: kaynak, süre, kredi. */}
          <dl className="ls-pod-preflight" aria-label="Yayın özeti">
            <div>
              <dt>Kaynak</dt>
              <dd>{sourceDocument ? sourceDocument.fileName : "Konu (genel bilgi)"}</dd>
            </div>
            <div>
              <dt>Tahmini süre</dt>
              <dd>~{ESTIMATED_MINUTES} dk · 4-5 bölüm · tek öğretmen</dd>
            </div>
            <div>
              <dt>Kredi</dt>
              <dd>
                Senaryo {creditCost ?? "—"} · Ses ~{ESTIMATED_MINUTES} (dakika başına 1;
                daha önce üretilmiş cümleler bedava)
              </dd>
            </div>
          </dl>

          {library.length ? (
            <section className="ls-pod-library" aria-labelledby="pod-library-heading">
              <h2 id="pod-library-heading" className="ls-credit">
                Yayınların
              </h2>
              <ul>
                {library.map((item) => (
                  <li key={item.id}>
                    <Link href={`/studio/podcast?podcastId=${item.id}`} className="ls-chapter">
                      <span>{item.title}</span>
                      <em className="ls-credit" style={{ fontStyle: "normal" }}>
                        dinle
                      </em>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {phase === "loading" ? (
        <StudioLoading
          title="Stüdyo ısınıyor"
          lead={savedEpisode && !title ? "Bölüm kütüphaneden açılıyor." : "Anlatım yazılıyor, sesler kaydediliyor."}
        />
      ) : null}

      {phase === "play" && chapter ? (
        <div className="ls-player">
          <p className="ls-studio-kicker">{tagline}</p>
          <h2 className="ls-entry-title">{title}</h2>

          {tracks?.length ? (
            <>
              <div className="ls-vinyl-wrap">
                <div className={cn("ls-vinyl", playing && "is-on")} aria-hidden />
                <button
                  type="button"
                  className="ls-play-orb"
                  onClick={toggle}
                  aria-label={playing ? "Duraklat" : "Oynat"}
                >
                  {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
                </button>
              </div>

              <div className="ls-pod-transport">
                <button
                  type="button"
                  className="ls-ghost ls-pod-skip"
                  onClick={() => seek(-10)}
                  aria-label="10 saniye geri"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  10
                </button>
                <div
                  className="ls-pod-progress"
                  role="progressbar"
                  aria-label="Yayın ilerlemesi"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(totalMs / 1000)}
                  aria-valuenow={Math.round(elapsedMs / 1000)}
                  aria-valuetext={`${formatClock(elapsedMs)} / ${formatClock(totalMs)}`}
                >
                  <span style={{ width: `${progressPct}%` }} />
                </div>
                <button
                  type="button"
                  className="ls-ghost ls-pod-skip"
                  onClick={() => seek(10)}
                  aria-label="10 saniye ileri"
                >
                  <RotateCw className="h-4 w-4" aria-hidden />
                  10
                </button>
              </div>
              <p className="ls-credit ls-pod-clock">
                {formatClock(elapsedMs)} / {formatClock(totalMs)}
              </p>

              <div className="ls-pod-speeds" role="group" aria-label="Oynatma hızı">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cn("ls-chip", s === speed && "is-on")}
                    aria-pressed={s === speed}
                    onClick={() => changeSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <div className={cn("ls-wave", playing && "is-on")} aria-hidden>
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i} style={{ height: `${30 + ((i * 17) % 70)}%` }} />
                ))}
              </div>
            </>
          ) : (
            <p className="ls-flash-text" role="status">
              {audioNote}
            </p>
          )}

          <p className="ls-flash-text">{chapter.title}</p>
          <div className="ls-explain" style={{ textAlign: "left" }}>
            {chapter.lines.map((line, i) => (
              <p key={i} className="ls-pod-line">
                <strong>{SPEAKER_LABEL[line.speaker]}</strong> {line.text}
              </p>
            ))}
          </div>

          <div className="ls-chapters">
            {chapters.map((item, i) => (
              <button
                key={`${item.title}-${i}`}
                type="button"
                className={cn("ls-chapter", i === index && "is-on")}
                aria-current={i === index ? "true" : undefined}
                onClick={() => {
                  if (!tracks?.length) {
                    setIndex(i);
                    return;
                  }
                  stop();
                  playFrom(firstTrackOf(i));
                }}
              >
                <span>
                  {i + 1}. {item.title}
                </span>
                <em className="ls-credit" style={{ fontStyle: "normal" }}>
                  {i === index && playing ? "çalıyor" : "bölüm"}
                </em>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === "results" ? (
        <StudioResults
          tool="podcast"
          topic={topic}
          title="Yayın bitti."
          lead="Bölümleri tekrar açabilir veya yeni bir konu isteyebilirsin. Bu bölüm kütüphanende duruyor."
          onAgain={() => {
            setIndex(0);
            setPhase("play");
            playFrom(0);
          }}
          onNew={() => {
            stop();
            setPhase("entry");
          }}
        />
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu podcast için hakkın yetmiyor. Yenilenince ya da paketinle devam edebilirsin."
        returnPath="/studio/podcast"
      />
    </StudioFrame>
  );
}

/** Metin uzunluğundan dinleme süresi — kütüphane ve önizleme için. */
export function estimateEpisodeMinutes(chapters: PodcastChapter[]): number {
  const chars = chapters.reduce(
    (sum, c) => sum + c.lines.reduce((s, l) => s + l.text.length, 0),
    0,
  );
  return Math.max(1, Math.round(chars / CHARS_PER_MINUTE));
}
