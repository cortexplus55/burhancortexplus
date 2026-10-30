"use client";

/** Podcast: oynatıcı ve dinleme kontrolü. */
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { PodcastListeningCheck } from "@/components/parity/podcast-listening-check";
import { awaitPodcastCheck, podcastCheckPending } from "@/lib/learning/podcast-check";
import type { PodcastLength } from "@/lib/learning/podcast-formats";
import { NODE_URL, jsonPost, type NodeLifecycle, type Payload } from "./use-node-lifecycle";

export function PodcastPlay({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, router, topicLabel, stage, podcastLength, loading, setLoading, payload, setPayload, attemptId, podcastCheckOpen, setPodcastCheckOpen, finish, chapters, podcastCheck } = life;
  return (
    <>
      {stage === "play" && payload.type === "podcast" && podcastCheckOpen && podcastCheck.length ? (
        <PodcastListeningCheck
          questions={podcastCheck}
          busy={loading}
          onDone={(checkAnswers) => void finish(checkAnswers)}
          onSkip={() => void finish({})}
        />
      ) : stage === "play" && payload.type === "podcast" ? (
        <ExamPodcastPlayer
          title={payload.title ?? topicLabel ?? "Podcast"}
          chapters={chapters}
          length={payload.length as PodcastLength | undefined}
          finishing={loading}
          resumeKey={`${prepId}:${nodeId}:${payload.length ?? podcastLength}`}
          scriptNote={
            typeof payload.scriptCredits === "number"
              ? payload.scriptCredits === 0
                ? "Senaryo önbellekten geldi; bu açılışta senaryo için hakkından düşülmedi."
                : undefined
              : undefined
          }
          onCreditsSpent={(spent) => {
            if (spent > 0) router.refresh();
          }}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
          // Kontrol varsa önce sorular (atlanabilir), sonra tamamlama (20 Ekim 2026). Kontrol yayımdan sonra
          // yazıldıysa (30 Ekim 2026, `checkPending`) kayıttan alınır; gelmezse podcast kontrolsüz biter.
          onFinish={() => {
            if (podcastCheck.length) return setPodcastCheckOpen(true);
            if (!podcastCheckPending(payload) || !attemptId) return void finish();
            setLoading(true);
            void awaitPodcastCheck(async () => {
              const res = await fetch(NODE_URL, jsonPost({ prepId, nodeId, attemptId, action: "progress", lessonFormat: 3 }));
              const data = (await res.json().catch(() => ({}))) as { payload?: Payload };
              return res.ok && data.payload ? data.payload : null;
            }).then((ready) => {
              setLoading(false);
              if (!ready) return void finish();
              setPayload(ready);
              setPodcastCheckOpen(true);
            });
          }}
        />
      ) : null}
    </>
  );
}
