"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import {
  postStudio,
  StudioEntry,
  StudioFrame,
  StudioLoading,
  StudioPaywall,
  StudioResults,
} from "@/components/learning/studio/studio-shared";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import {
  SPEAKER_LABEL,
  normalizeChapters,
  type PodcastChapter,
} from "@/lib/learning/podcast-script";
import { cn } from "@/lib/utils";


export function PodcastStudio({
  creditCost,
  initialTopic = "",
}: {
  creditCost: number | null;
  initialTopic?: string;
}) {
  const [phase, setPhase] = useState<"entry" | "loading" | "play" | "results">("entry");
  const [topic, setTopic] = useState(initialTopic);
  const [title, setTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [chapters, setChapters] = useState<PodcastChapter[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => () => stopSpeech(), []);

  async function start(topic: string) {
    setPhase("loading");
    const result = await postStudio<{
      title?: string;
      tagline?: string;
      chapters?: unknown[];
    }>("/api/learning/podcast/generate", { topic });
    if ("paywall" in result) {
      setPaywall(true);
      setPhase("entry");
      return;
    }
    if (!result.ok || !result.data.chapters?.length) {
      toast.error(result.ok ? "Podcast üretilemedi." : result.error);
      setPhase("entry");
      return;
    }
    setTopic(topic);
    setTitle(result.data.title ?? topic);
    setTagline(result.data.tagline ?? "Kısa, konuşma dilinde bir tekrar.");
    const normalized = normalizeChapters(result.data.chapters);
    if (!normalized.length) {
      toast.error("Podcast üretilemedi.");
      setPhase("entry");
      return;
    }
    setChapters(normalized);
    setIndex(0);
    setPlaying(false);
    setPhase("play");
  }

  function playFrom(nextIndex: number) {
    const chapter = chapters[nextIndex];
    if (!chapter) {
      setPlaying(false);
      setPhase("results");
      return;
    }
    setIndex(nextIndex);
    setPlaying(true);
    speakTurkish(chapter.lines.map((line) => line.text).join(" "), () => {
      if (nextIndex + 1 >= chapters.length) {
        setPlaying(false);
        setPhase("results");
        return;
      }
      playFrom(nextIndex + 1);
    });
  }

  function toggle() {
    if (playing) {
      stopSpeech();
      setPlaying(false);
      return;
    }
    playFrom(index);
  }

  const chapter = chapters[index];

  return (
    <StudioFrame tool="podcast" kicker="Podcast stüdyosu">
      {phase === "entry" ? (
        <StudioEntry
          tool="podcast"
          title="Konuyu dinle."
          placeholder="Örn. Hücre bölünmesi"
          submitLabel="Yayını hazırla"
          creditCost={creditCost}
          initialTopic={initialTopic}
          onSubmit={(next) => void start(next)}
        />
      ) : null}

      {phase === "loading" ? (
        <StudioLoading title="Stüdyo ısınıyor" lead="Anlatım yazılıyor, bölümler sıralanıyor." />
      ) : null}

      {phase === "play" && chapter ? (
        <div className="ls-player">
          <p className="ls-studio-kicker">{tagline}</p>
          <h2 className="ls-entry-title">{title}</h2>
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
                  stopSpeech();
                  playFrom(i);
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
            stopSpeech();
            setPhase("entry");
          }}
        />
      ) : null}

      <StudioPaywall open={paywall} onOpenChange={setPaywall} returnPath="/studio/podcast" />
    </StudioFrame>
  );
}
