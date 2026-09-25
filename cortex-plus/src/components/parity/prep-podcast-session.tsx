"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import {
  describeGenerationFailure,
  generationFailureCode,
} from "@/lib/learning/generation-failure";

export function PrepPodcastSession({
  prepId,
  topicId,
  topicLabel,
  length,
}: {
  prepId: string;
  topicId: string;
  topicLabel: string;
  length: "ozet" | "standart" | "derin";
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [title, setTitle] = useState(topicLabel);
  const [chapters, setChapters] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    const clientRequestId = crypto.randomUUID();
    setStatus("loading");
    void fetch("/api/learning/exam-prep/podcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, topicId, length, clientRequestId }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          title?: string;
          chapters?: unknown[];
          code?: string;
          error?: string;
        };
        if (!alive) return;
        if (!res.ok || !Array.isArray(data.chapters)) {
          const failure = describeGenerationFailure(generationFailureCode(data), undefined, "podcast");
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
        setMessage("Bağlantı kurulamadı. Yeniden deneyebilirsin.");
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt, prepId, topicId, topicLabel, length]);

  const home = `/deneme-sinavlari/${prepId}`;

  if (status === "loading") {
    return (
      <section className="cp-pod" aria-busy="true">
        <p className="cp-pod-state">Podcast hazırlanıyor…</p>
      </section>
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
