"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamPrepPath } from "@/components/parity/exam-prep-path";
import { ExamFinishButton } from "@/components/parity/exam-finish-button";
import {
  continueHref,
  nextOpenTopic,
  type PrepTopic,
} from "@/lib/learning/exam-prep-progress";
import type { TopicLesson } from "@/lib/learning/exam-prep-topics";
import { CreditGate } from "@/components/paywall/credit-gate";

export function ExamPrepStudySession({
  prepId,
  prepTitle,
  topics,
  initialTopicId,
  lessonsByTopic,
}: {
  prepId: string;
  prepTitle: string;
  topics: PrepTopic[];
  initialTopicId: string | null;
  lessonsByTopic: Record<string, TopicLesson>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [generating, setGenerating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const activeTopic = useMemo(() => {
    const fromUrl = searchParams.get("topic");
    return (
      topics.find((topic) => topic.id === fromUrl) ??
      topics.find((topic) => topic.id === initialTopicId) ??
      nextOpenTopic(topics) ??
      topics[0] ??
      null
    );
  }, [searchParams, topics, initialTopicId]);

  const lesson = activeTopic ? (lessonsByTopic[activeTopic.id] ?? null) : null;
  const nextAfter = activeTopic
    ? (topics.find(
        (topic) => topic.sortOrder > activeTopic.sortOrder && topic.status !== "done",
      ) ?? nextOpenTopic(topics.filter((topic) => topic.id !== activeTopic.id)))
    : nextOpenTopic(topics);

  async function generateLesson() {
    if (!activeTopic) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/learning/exam-prep/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, topicId: activeTopic.id }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Ders üretilemedi.");
        return;
      }
      toast.success("Ders hazır.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setGenerating(false);
    }
  }

  async function completeTopic() {
    if (!activeTopic) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/learning/exam-prep/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          topicId: activeTopic.id,
          action: "complete",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Konu işaretlenemedi.");
        return;
      }
      toast.success(`${activeTopic.label} tamamlandı.`);
      router.push(payload.nextHref ?? continueHref(prepId, topics));
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="ap-exam-page ap-exam-study">
      <div className="ap-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill">
          ← Konu yolu
        </Link>
        <span className="text-sm text-[var(--ap-muted)]">{prepTitle}</span>
      </div>

      <p className="ap-lesson-kicker">Konu seç</p>
      <ExamPrepPath prepId={prepId} topics={topics} activeId={activeTopic?.id} />

      {activeTopic ? (
        <section className="ap-exam-topic-stage" key={activeTopic.id}>
          <h1>{activeTopic.label}</h1>
          <p className="text-sm text-[var(--ap-muted)]">
            {activeTopic.status === "done"
              ? "Bu konuyu bitirdin. İstersen dersi tekrar oku veya sıradakine geç."
              : lesson
                ? "Dersi oku, sonra konuyu tamamla — sonraki açılır."
                : "Yalnızca bu konunun dersi üretilir. Başka derse veya sohbete düşmezsin."}
          </p>

          {lesson ? (
            <>
              <h2 className="ap-exam-topic-lesson-title">{lesson.title}</h2>
              <ExamLessonBody content={lesson.contentMd} />
            </>
          ) : (
            <div className="ap-exam-topic-empty">
              <p>Henüz ders yok.</p>
              <button
                type="button"
                className="ap-exam-continue ap-exam-continue--primary"
                disabled={generating}
                onClick={() => void generateLesson()}
              >
                {generating ? "Anlatılıyor…" : "Bu konuyu anlat"}
              </button>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-[var(--ap-muted)]">Önce bir konu seç.</p>
      )}

      <div className="ap-exam-study-footer">
        {lesson && activeTopic && activeTopic.status !== "done" ? (
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            disabled={completing}
            onClick={() => void completeTopic()}
          >
            {completing ? "Kaydediliyor…" : "Konuyu tamamla"}
          </button>
        ) : null}
        {nextAfter && nextAfter.id !== activeTopic?.id ? (
          <button
            type="button"
            className="ap-exam-continue"
            onClick={() =>
              router.push(
                `/deneme-sinavlari/${prepId}/calis?topic=${nextAfter.id}`,
                { scroll: false },
              )
            }
          >
            Sonraki: {nextAfter.label}
          </button>
        ) : null}
        <ExamFinishButton prepId={prepId} />
      </div>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Ders üretmek için kredin kalmadı."
        returnPath={`/deneme-sinavlari/${prepId}/calis`}
      />
    </div>
  );
}
