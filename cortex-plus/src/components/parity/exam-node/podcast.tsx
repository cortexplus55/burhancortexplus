"use client";

/** Podcast: oynatıcı ve dinleme kontrolü. */
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { PodcastListeningCheck } from "@/components/parity/podcast-listening-check";
import type { PodcastLength } from "@/lib/learning/podcast-formats";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function PodcastPlay({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, router, topicLabel, stage, podcastLength, loading, payload, podcastCheckOpen, finish, chapters, podcastCheck, finishPodcast } = life;
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
          onFinish={finishPodcast}
        />
      ) : null}
    </>
  );
}
