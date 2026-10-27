"use client";

import { cn } from "@/lib/utils";
import { karaokeWordIndex } from "@/lib/learning/podcast-script";

/**
 * Aktif satırın kelimeleri. Geçenler `is-spoken`, okunan `is-current-word`.
 * Oran satırın kendi ses süresindendir.
 */
export function PodcastKaraokeLine({
  text,
  currentTime,
  duration,
  active = true,
}: {
  text: string;
  currentTime: number;
  duration: number;
  active?: boolean;
}) {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (!active || words.length === 0) return <>{text}</>;
  const activeWordIndex = karaokeWordIndex(text, currentTime, duration);
  return (
    <span className="cp-pod-karaoke" data-karaoke="word">
      {words.map((word, index) => (
        <span
          key={`${index}-${word}`}
          className={cn(
            "cp-pod-word",
            index < activeWordIndex && "is-spoken",
            index === activeWordIndex && "is-current-word",
          )}
        >
          {word}{" "}
        </span>
      ))}
    </span>
  );
}
