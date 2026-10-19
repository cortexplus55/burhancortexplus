"use client";

import { useRouter } from "next/navigation";
import type { PodcastLength } from "@/lib/learning/podcast-formats";
import { useEffect, useState } from "react";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import {
  describeGenerationFailure,
  generationFailureCode,
} from "@/lib/learning/generation-failure";
import { BUSY_NOTE, postJsonWithRetry } from "@/lib/learning/generation-retry";
import { useIsFounder } from "@/lib/student/student-shell-context";
import "@/styles/node-generation-progress.css";

export function PrepPodcastSession({
  prepId,
  topicId,
  topicLabel,
  length,
}: {
  prepId: string;
  topicId: string;
  topicLabel: string;
  length: PodcastLength;
}) {
  const router = useRouter();
  const isAdmin = useIsFounder();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState(topicLabel);
  const [chapters, setChapters] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");
  /** Üretim yuvaları dolu: "sıradasın" notu (19 Ekim 2026, Faz 3.2). */
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    // Üretim düşerse bir kez kendiliğinden, yeni istek kimliğiyle yeniden istenir (19 Ekim 2026):
    // öğrenci "üretilemedi" görmeden önce iki tam deneme yapılır.
    void postJsonWithRetry<{
      title?: string;
      chapters?: unknown[];
      code?: string;
      error?: string;
      refunded?: boolean;
      reason?: string;
    }>("/api/learning/exam-prep/podcast", () => ({ prepId, topicId, length, clientRequestId: crypto.randomUUID() }), {
      onBusy: () => {
        if (alive) setQueued(true);
      },
    })
      .then(({ res, data }) => {
        if (!alive) return;
        setQueued(false);
        if (!res.ok || !Array.isArray(data.chapters)) {
          const failure = describeGenerationFailure(
            generationFailureCode(data),
            undefined,
            "podcast",
            {
              isAdmin,
              refunded: data.refunded === true,
              reason: data.reason,
            },
          );
          setMessage(failure.message);
          setStatus("error");
          return;
        }
        setTitle(data.title || topicLabel);
        setChapters(data.chapters);
        setStatus("ready");
      })
      .catch(() => {
        if (!alive) return;
        setMessage("Bağlantı koptu. Yeniden dene; podcast kaldığı yerden hazırlanır.");
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt, prepId, topicId, topicLabel, length, isAdmin]);

  const home = `/deneme-sinavlari/${prepId}`;

  if (status === "loading") {
    // Düğüm ekranındaki bekleme ekranının aynısı: boş bir "hazırlanıyor" yazısı 50 sn sürüyordu.
    return (
      <NodeGenerationProgress
        title="Podcast hazırlanıyor…"
        note={queued ? BUSY_NOTE : undefined}
        onClose={() => router.push(home)}
      />
    );
  }

  if (status === "error") {
    return (
      <section className="cp-pod">
        <p role="alert" className="cp-pod-state">
          {message}
        </p>
        <button type="button" className="cp-exam-continue" onClick={() => setAttempt((value) => value + 1)}>
          Yeniden dene
        </button>
      </section>
    );
  }

  return (
    <ExamPodcastPlayer
      title={title}
      chapters={chapters}
      resumeKey={`${prepId}:${topicId}:${length}`}
      onClose={() => router.push(home)}
      onFinish={() => router.push(home)}
    />
  );
}
