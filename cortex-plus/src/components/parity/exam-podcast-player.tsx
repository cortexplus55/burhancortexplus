"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { speakTurkish, stopSpeech } from "@/lib/learning/studio-speech";
import { cn } from "@/lib/utils";

type Chapter = { title: string; script: string };

export function ExamPodcastPlayer({
  title,
  chapters,
  onFinish,
  finishing,
}: {
  title: string;
  chapters: Chapter[];
  onFinish: () => void;
  finishing?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const tokenRef = useRef(0);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;

  useEffect(() => {
    playFrom(0);
    return () => {
      tokenRef.current += 1;
      stopSpeech();
    };
    // Mounted once per generated podcast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playFrom(nextIndex: number) {
    const list = chaptersRef.current;
    const chapter = list[nextIndex];
    if (!chapter) {
      setPlaying(false);
      setHeard(true);
      return;
    }
    const token = ++tokenRef.current;
    setIndex(nextIndex);
    setPlaying(true);
    speakTurkish(chapter.script, () => {
      if (token !== tokenRef.current) return;
      if (nextIndex + 1 >= list.length) {
        setPlaying(false);
        setHeard(true);
        return;
      }
      playFrom(nextIndex + 1);
    });
  }

  function toggle() {
    if (playing) {
      tokenRef.current += 1;
      stopSpeech();
      setPlaying(false);
      return;
    }
    playFrom(index);
  }

  const chapter = chapters[index];
  if (!chapter) {
    return <p className="text-sm text-[var(--ap-muted)]">Bu podcast henüz üretilemedi.</p>;
  }

  return (
    <section className="ap-exam-pod">
      <p className="ap-lesson-kicker">
        Bölüm {index + 1}/{chapters.length}
      </p>
      <h1>{title}</h1>
      <div className="ap-exam-pod-stage">
        <button
          type="button"
          className={cn("ap-exam-pod-orb", playing && "is-on")}
          onClick={toggle}
          aria-label={playing ? "Duraklat" : "Oynat"}
        >
          {playing ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
        </button>
        <p className="ap-exam-pod-now">{playing ? "Çalıyor" : heard ? "Bitti" : "Duraklatıldı"}</p>
        <h2>{chapter.title}</h2>
        <p className="ap-exam-pod-script">{chapter.script}</p>
      </div>
      <ol className="ap-exam-pod-chapters">
        {chapters.map((item, i) => (
          <li key={`${item.title}-${i}`}>
            <button
              type="button"
              className={cn("ap-exam-pod-chapter", i === index && "is-on")}
              onClick={() => playFrom(i)}
            >
              <strong>
                {i + 1}. {item.title}
              </strong>
              <em>{i === index && playing ? "çalıyor" : "bölüm"}</em>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="ap-exam-continue ap-exam-continue--primary"
        disabled={finishing || (!heard && playing)}
        onClick={onFinish}
      >
        {finishing ? "Kaydediliyor…" : heard ? "Dinledim, devam" : "Bu bölümü atla"}
      </button>
    </section>
  );
}
