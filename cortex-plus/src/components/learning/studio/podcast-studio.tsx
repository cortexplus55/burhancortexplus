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
  SPEAKERS,
  flattenLines,
  formatClock,
  normalizeChapters,
  speakerLiveBadge,
  type PodcastChapter,
} from "@/lib/learning/podcast-script";
import {
  documentSuggestions,
  sourceNotice,
  StudioChoices,
  StudioSetup,
  StudioSourcePicker,
  type StudioDocument,
  type StudioSourceMode,
} from "@/components/learning/studio/studio-setup";
import {
  DEFAULT_PODCAST_LENGTH,
  PODCAST_FORMAT_OPTIONS,
  estimatedPodcastMinutes,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
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
/** Tür = süre (19 Ekim 2026'dan beri Araçlar'da da seçilir; önce hep 5 dakikalık diyalogdu). */
const FORMAT_CHOICES = PODCAST_FORMAT_OPTIONS.map((option) => ({
  value: option.id,
  label: `${option.label} · ${option.minutes} dk`,
}));

export function PodcastStudio({
  creditCost,
  initialTopic = "",
  documents = [],
  initialDocumentId = null,
  library = [],
  savedEpisode = null,
}: {
  creditCost: number | null;
  initialTopic?: string;
  /** Hazır belgeler; seçilirse senaryo yalnızca o belgeden. */
  documents?: StudioDocument[];
  initialDocumentId?: string | null;
  /** Daha önce üretilen bölümler — yeniden açılabilir. */
  library?: PodcastLibraryItem[];
  /** `?podcastId=` ile açılan kayıtlı bölüm; sese doğrudan geçer. */
  savedEpisode?: SavedEpisode | null;
}) {
  const [sourceMode, setSourceMode] = useState<StudioSourceMode>(initialDocumentId ? "document" : "topic");
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId ?? documents[0]?.id ?? null);
  const [length, setLength] = useState<PodcastLength>(DEFAULT_PODCAST_LENGTH);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceDocument = sourceMode === "document" ? documents.find((doc) => doc.id === documentId) ?? null : null;
  const format = PODCAST_FORMAT_OPTIONS.find((option) => option.id === length) ?? PODCAST_FORMAT_OPTIONS[0];
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "results">("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [chapters, setChapters] = useState<PodcastChapter[]>([]);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  /** Ses gelmediğinde öğrenciye söylenen tek cümle; robot sese düşmüyoruz. */
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [lineCursor, setLineCursor] = useState(0);
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
  /*
    Ses akışla gelir (19 Ekim 2026): önce bütün sesi bekliyordu, 5 dakikalık diyalogda senaryo 37 sn
    sürerken oynatıcı ~3,5 dk sonra açıldı. Şimdi ilk satırın sesi gelince açılır; çalarken sıradaki
    satır henüz yoksa oynatıcı onu bekler (waitingRef), gelince kaldığı yerden sürer.
  */
  const linesRef = useRef<(Track | undefined)[]>([]);
  const completeRef = useRef(true);
  const waitingRef = useRef<(() => void) | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const scriptBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const node = scriptBoxRef.current?.querySelector(".ls-pod-line.is-now");
    if (node && "scrollIntoView" in node) {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [lineCursor, index]);

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

  const knownMs = tracks?.reduce((sum, t) => sum + t.durationMs, 0) ?? 0;
  // Ses gelirken toplam süre senaryodan tahmin; bitince gerçek süre.
  const totalMs = audioLoading ? Math.max(knownMs, estimateEpisodeMinutes(chapters) * 60_000) : knownMs;

  /** Satırın bölüm içindeki başlangıcı — her an gelen satırlardan hesaplanır. */
  function offsetOf(cursor: number): number {
    let sum = 0;
    for (let i = 0; i < cursor; i += 1) sum += linesRef.current[i]?.durationMs ?? 0;
    return sum;
  }

  /** İlk satırın sesi gelince (ya da ses hiç gelmezse) döner; geri kalanı arkada akar. */
  async function fetchAudio(normalized: PodcastChapter[]): Promise<void> {
    const expected = flattenLines(normalized);
    linesRef.current = [];
    completeRef.current = false;
    waitingRef.current = null;
    setAudioLoading(true);
    let resolveFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const publish = () => {
      const prefix: Track[] = [];
      for (const item of linesRef.current) {
        if (!item) break;
        prefix.push(item);
      }
      setTracks(prefix.length ? prefix : null);
      if (!prefix.length) return;
      resolveFirst();
      const resume = waitingRef.current;
      if (resume && prefix.length > cursorRef.current) {
        waitingRef.current = null;
        resume();
      }
    };
    const finish = (note?: string) => {
      completeRef.current = true;
      setAudioLoading(false);
      if (note && !linesRef.current.some(Boolean)) setAudioNote(note);
      // Çalarken satır beklenip ses bittiyse oynatıcı sona gelmiş sayılır.
      const resume = waitingRef.current;
      waitingRef.current = null;
      resume?.();
      resolveFirst();
    };
    const failed = "Ses bu sefer gelmedi; hakkından düşülmedi. Senaryoyu aşağıdan okuyabilirsin.";
    const noCredits = "Bu bölümün sesi için kullanım hakkın yetmedi. Senaryoyu aşağıdan okuyabilirsin.";

    void (async () => {
      try {
        const res = await fetch("/api/learning/podcast/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapters: normalized, stream: true }),
        });
        if (res.status === 402) {
          openPaywall();
          finish(noCredits);
          return;
        }
        if (!res.ok || !res.body) {
          finish(failed);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
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
              speaker?: string;
              text?: string;
              url?: string;
              durationMs?: number;
              lines?: unknown;
            };
            if (event.type === "error") {
              const refused = event.code === "insufficient_credits" || event.code === "premium_required";
              if (refused) openPaywall();
              finish(refused ? noCredits : failed);
              return;
            }
            if (event.type === "line" && typeof event.index === "number") {
              // Her satır senaryodaki yerine karşı denetlenir (bütün ses gelince bir kez daha).
              const source = expected[event.index];
              if (
                source &&
                event.text === source.text &&
                event.speaker === source.speaker &&
                typeof event.url === "string" &&
                event.url.startsWith("https:") &&
                typeof event.durationMs === "number" &&
                event.durationMs > 0
              ) {
                linesRef.current[event.index] = {
                  chapterIndex: source.chapterIndex,
                  url: event.url,
                  durationMs: event.durationMs,
                };
                publish();
              }
            }
            if (event.type === "done") {
              const verified = validatePodcastAudio(normalized, event.lines);
              if (verified) {
                linesRef.current = verified;
                publish();
              }
              finish(verified ? undefined : "Sesin tamamı doğrulanamadı. Senaryoyu aşağıdan okuyabilirsin.");
              return;
            }
          }
        }
        finish(failed);
      } catch {
        finish(failed);
      }
    })();
    await first;
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
      source?: { kind?: string; wholeDocument?: boolean; matched?: boolean; fileName?: string | null };
    }>("/api/learning/podcast/generate", {
      topic: nextTopic,
      length,
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
          : "Podcast bu sefer gelmedi. İki kez denedik. Kredin düşmedi, yeniden dene.",
      );
      setPhase("entry");
      return;
    }

    setNotice(sourceNotice(script.data.source));
    const normalized = normalizeChapters(script.data.chapters);
    if (!normalized.length) {
      toast.error("Podcast bu sefer gelmedi. Yeniden dene.");
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
      Ses ayrı bir istek ve ayrı bir bedel (900 karakter = 15 kredi; önbellekten
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
    if (!linesRef.current[trackIndex]) return;

    const token = ++tokenRef.current;
    if (!audioRef.current) audioRef.current = new Audio();
    const element = audioRef.current;

    const step = (cursor: number, startAt: number) => {
      if (token !== tokenRef.current) return;
      const track = linesRef.current[cursor];
      if (!track) {
        // Ses hâlâ geliyorsa sıradaki satır beklenir; gelince buradan sürer.
        if (!completeRef.current) {
          cursorRef.current = cursor;
          waitingRef.current = () => step(cursor, 0);
          return;
        }
        setPlaying(false);
        setPhase("results");
        return;
      }
      cursorRef.current = cursor;
      setLineCursor(cursor);
      setIndex(track.chapterIndex);
      element.src = track.url;
      applySpeed(element);
      element.onloadedmetadata = () => {
        if (startAt > 0) element.currentTime = Math.min(startAt, Math.max(0, element.duration - 0.1));
      };
      element.ontimeupdate = () => {
        if (token !== tokenRef.current) return;
        setElapsedMs(offsetOf(cursor) + element.currentTime * 1000);
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
      // Sıradaki satırı bekliyorduysa o satır gelince kendiliğinden çalmasın.
      waitingRef.current = null;
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
   * 15 saniye ileri/geri. Satırlar ayrı ses dosyaları olduğu için sıçrama
   * dosya sınırını aşarsa komşu satıra taşınır; zaman çizelgesi öğrenci için
   * tek bir bölüm gibi akar.
   */
  function seek(deltaSec: number) {
    const list = tracks;
    if (!list?.length) return;
    const cursor = cursorRef.current;
    const element = audioRef.current;
    const withinMs = element?.src ? element.currentTime * 1000 : 0;
    let targetMs = offsetOf(cursor) + withinMs + deltaSec * 1000;
    // Yalnız gelmiş sese sıçranır.
    targetMs = Math.max(0, Math.min(targetMs, Math.max(0, knownMs - 500)));

    let target = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (targetMs < offsetOf(i) + list[i].durationMs) {
        target = i;
        break;
      }
      target = i;
    }
    const offsetSec = (targetMs - offsetOf(target)) / 1000;
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
    waitingRef.current = null;
    audioRef.current?.pause();
    setPlaying(false);
  }

  const chapter = chapters[index];
  const progressPct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
  const flatLines = flattenLines(chapters);
  const activeFlat = flatLines[lineCursor];
  const liveSpeaker = activeFlat?.speaker ?? chapter?.lines[0]?.speaker ?? "ada";

  return (
    <StudioFrame tool="podcast" kicker="Podcast">
      {phase === "entry" ? (
        <>
          <p className="ls-pod-lock">
            <a href="/ornek" className="ls-pod-lock-link">
              Örnek bölümü dinle
            </a>
          </p>
          <StudioEntry
            tool="podcast"
            title="Podcast"
            placeholder={sourceDocument ? "Örn. Belgenin tamamı ya da bir bölüm" : "Örn. Hücre bölünmesi"}
            submitLabel="Yayını hazırla"
            creditCost={creditCost}
            initialTopic={initialTopic}
            suggestions={documentSuggestions(sourceDocument)}
            setup={
              <StudioSetup>
                <StudioSourcePicker
                  idPrefix="podcast"
                  documents={documents}
                  mode={sourceMode}
                  onModeChange={setSourceMode}
                  documentId={documentId}
                  onDocumentChange={setDocumentId}
                />
                <StudioChoices label="Tür ve süre" options={FORMAT_CHOICES} value={length} onChange={setLength} />
              </StudioSetup>
            }
            onSubmit={(next) => void start(next)}
          />

          {/* Üretimden önce ne alınacağı: kaynak ve süre. Öğrenci kredi sayısı görmez (AGENTS.md). */}
          <dl className="ls-pod-preflight" aria-label="Yayın özeti">
            <div>
              <dt>Kaynak</dt>
              <dd>{sourceDocument ? sourceDocument.fileName : "Konu (genel bilgi)"}</dd>
            </div>
            <div>
              <dt>Tahmini süre</dt>
              <dd>~{format.minutes} dk · {format.blurb}</dd>
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
          {notice ? <p className="ls-source-notice">{notice}</p> : null}

          {tracks?.length ? (
            <>
              <div className="ls-duo" aria-hidden>
                {SPEAKERS.map((speaker) => {
                  const live = liveSpeaker === speaker;
                  return (
                    <div
                      key={speaker}
                      className={cn("ls-duo-orb", `is-${speaker}`, live && "is-live", live && playing && "is-on", !live && "is-dim")}
                    >
                      <span>{SPEAKER_LABEL[speaker]}</span>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="ls-play-orb"
                onClick={toggle}
                aria-label={playing ? "Duraklat" : "Oynat"}
              >
                {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
              </button>
              {activeFlat ? (
                <p className={cn("ls-pod-who", `is-${liveSpeaker}`)} aria-live="polite">
                  {speakerLiveBadge(liveSpeaker, activeFlat.beat)}
                </p>
              ) : null}

              <div className="ls-pod-transport">
                <button
                  type="button"
                  className="ls-ghost ls-pod-skip"
                  onClick={() => seek(-15)}
                  aria-label="15 saniye geri"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  15
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
                  onClick={() => seek(15)}
                  aria-label="15 saniye ileri"
                >
                  <RotateCw className="h-4 w-4" aria-hidden />
                  15
                </button>
              </div>
              <p className="ls-credit ls-pod-clock">
                {formatClock(elapsedMs)} / {audioLoading ? "~" : ""}
                {formatClock(totalMs)}
              </p>
              {audioLoading ? (
                <p className="ls-credit" role="status">
                  Dinlemeye başlayabilirsin; sesin geri kalanı hazırlanıyor.
                </p>
              ) : null}

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
          <div className="ls-explain ls-pod-script" style={{ textAlign: "left" }} ref={scriptBoxRef}>
            {chapter.lines.map((line, i) => {
              const chapterStart = flatLines.findIndex((item) => item.chapterIndex === index);
              const global = (chapterStart < 0 ? 0 : chapterStart) + i;
              const current = global === lineCursor;
              return (
                <button
                  key={`${line.speaker}-${i}`}
                  type="button"
                  className={cn("ls-pod-line", `is-${line.speaker}`, current && "is-now")}
                  onClick={() => {
                    if (!tracks?.length) return;
                    playFrom(global);
                  }}
                >
                  <strong>{SPEAKER_LABEL[line.speaker]}</strong> {line.text}
                </button>
              );
            })}
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
        action="PODCAST_GENERATE"
        actionLabel="Podcast"
        returnPath="/studio/podcast"
      />
    </StudioFrame>
  );
}

/**
 * Metin uzunluğundan dinleme süresi — kütüphane ve önizleme için; ölçülen okuma hızıyla (kelime/dk). 24 Ekim 2026
 * lansman testi: 5 dakikalık diyalog yüklenirken "~3:00" gösterdi, ses 4:24 çıktı — tahmin faturalamanın
 * 900 karakter/dk sabitini kullanıyordu (gerçek konuşma ~620 karakter/dk).
 */
export function estimateEpisodeMinutes(chapters: PodcastChapter[]): number {
  const lines = chapters.flatMap((chapter) => chapter.lines);
  const words = lines.reduce((sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length, 0);
  return estimatedPodcastMinutes(words, new Set(lines.map((line) => line.speaker)).size > 1 ? "duo" : "single");
}
