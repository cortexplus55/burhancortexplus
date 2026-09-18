"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioResults,
} from "@/components/learning/studio/studio-shared";
import { CreditGate } from "@/components/paywall/credit-gate";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import {
  SPEAKER_LABEL,
  normalizeChapters,
  type PodcastChapter,
} from "@/lib/learning/podcast-script";
import { cn } from "@/lib/utils";

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
 * Şimdi: podcast Plus'a özel ve stüdyo gerçek sesi çalıyor. Robot ses yolu
 * tümüyle kalktı — podcast ya gerçek sesiyle vardır ya yoktur. Ücretsiz
 * kullanıcı ürünü `/ornek` sayfasında, hazır bir bölümün gerçek sesinden
 * duyuyor; orada bize maliyeti yok.
 */

type Track = { chapterIndex: number; url: string; durationMs: number };

export function PodcastStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const isPremium = Boolean(useStudentShellAccount()?.isPremium);

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
  const [paywall, setPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"premium" | "credits">("premium");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bölüm değiştirince eski zincir susmalı; her oynatma kendi jetonunu taşıyor.
  const tokenRef = useRef(0);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      audioRef.current?.pause();
    };
  }, []);

  function openPaywall(reason: "premium" | "credits") {
    setPaywallReason(reason);
    setPaywall(true);
  }

  async function start(nextTopic: string) {
    // Aboneliği olmayan öğrenci isteği hiç göndermiyor: sunucu da reddediyor
    // ama burada durdurmak ona boş bir bekleme ekranı göstermekten iyi.
    if (!isPremium) {
      openPaywall("premium");
      return;
    }

    setPhase("loading");
    setAudioNote(null);
    setTracks(null);

    const script = await postStudio<{
      title?: string;
      tagline?: string;
      chapters?: unknown[];
    }>("/api/learning/podcast/generate", { topic: nextTopic });

    if ("paywall" in script) {
      openPaywall(script.code === "premium_required" ? "premium" : "credits");
      setPhase("entry");
      return;
    }
    if (!script.ok || !script.data.chapters?.length) {
      toast.error(script.ok ? "Podcast üretilemedi." : script.error);
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
      Kalkan tek şey robot ses.
    */
    const audio = await postStudio<{ lines?: Track[] }>(
      "/api/learning/podcast/audio",
      { chapters: normalized },
    );

    if ("paywall" in audio) {
      openPaywall(audio.code === "premium_required" ? "premium" : "credits");
      setAudioNote("Bu bölümün sesi için kredin yetmedi. Senaryoyu aşağıdan okuyabilirsin.");
    } else if (!audio.ok || !audio.data.lines?.length) {
      setAudioNote("Ses şu an üretilemedi. Senaryoyu aşağıdan okuyabilirsin.");
    } else {
      setTracks(audio.data.lines);
    }

    setPhase("play");
  }

  function playFrom(trackIndex: number) {
    const list = tracks;
    if (!list?.length) return;

    const token = ++tokenRef.current;
    if (!audioRef.current) audioRef.current = new Audio();
    const element = audioRef.current;

    const step = (cursor: number) => {
      if (token !== tokenRef.current) return;
      const track = list[cursor];
      if (!track) {
        setPlaying(false);
        setPhase("results");
        return;
      }
      setIndex(track.chapterIndex);
      element.src = track.url;
      element.onended = () => step(cursor + 1);
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
    step(trackIndex);
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
      void element.play().catch(() => setPlaying(false));
      return;
    }
    playFrom(firstTrackOf(index));
  }

  function stop() {
    tokenRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
  }

  const chapter = chapters[index];

  return (
    <StudioFrame tool="podcast" kicker="Podcast stüdyosu">
      {phase === "entry" ? (
        <>
          {!isPremium ? (
            /*
              Kilit görünür duruyor, gizlenmiyor: öğrenci ne olduğunu bilmeli
              ki isteyebilsin. Yanındaki bağlantı da boş bir vaat değil —
              `/ornek` hazır bir bölümü GERÇEK sesiyle, girişsiz çalıyor.
            */
            <div className="ls-pod-lock">
              <p>
                <strong>Podcast Plus&apos;a özel.</strong> Ada ve Kerem&apos;in
                iki sesli anlatımı — konuyu yürürken dinleyebilesin diye.
              </p>
              <a href="/ornek" className="ls-pod-lock-link">
                Örnek bölümü dinle
              </a>
            </div>
          ) : null}
          <StudioEntry
            tool="podcast"
            title="Konuyu dinle."
            placeholder="Örn. Hücre bölünmesi"
            submitLabel={isPremium ? "Yayını hazırla" : "Plus'a geç"}
            creditCost={creditCost}
            initialTopic={initialTopic}
            onSubmit={(next) => void start(next)}
          />
        </>
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Stüdyo ısınıyor" lead="Anlatım yazılıyor, sesler kaydediliyor." />
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
              <div className={cn("ls-wave", playing && "is-on")} aria-hidden>
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i} style={{ height: `${30 + ((i * 17) % 70)}%` }} />
                ))}
              </div>
            </>
          ) : (
            <p className="ls-flash-text">{audioNote}</p>
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
          lead="Bölümleri tekrar açabilir veya yeni bir konu isteyebilirsin."
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
        /*
          Sebebi ayırmak şart: "kredin yetmiyor" demek, aboneliği olmayan
          öğrenciye kredi alırsa açılacağını söyler — açılmaz.
        */
        message={
          paywallReason === "premium"
            ? "Podcast Plus aboneliğine özel."
            : "Bu podcast için kredin yetmiyor."
        }
        returnPath="/studio/podcast"
      />
    </StudioFrame>
  );
}
