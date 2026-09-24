"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { LessonOpenChrome, type LessonOpenStep } from "@/components/parity/lesson-open-chrome";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import { lessonV2Schema, type LessonV2 } from "@/lib/learning/teaching-standards";
import { ExamPrepPath } from "@/components/parity/exam-prep-path";
import { ExamFinishButton } from "@/components/parity/exam-finish-button";
import { PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";
import {
  continueHref,
  nextOpenTopic,
  type PrepTopic,
} from "@/lib/learning/exam-prep-progress";
import type { TopicLesson } from "@/lib/learning/exam-prep-topics";
import {
  DEFAULT_FAMILIARITY,
  DEFAULT_MOOD,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import { CreditGate } from "@/components/paywall/credit-gate";
import "@/styles/node-generation-progress.css";

/** Yapılandırılmış ders varsa döndürür; şemaya uymuyorsa markdowna düşülür. */
function structuredLesson(raw: unknown): LessonV2 | null {
  if (!raw) return null;
  return lessonV2Schema.safeParse(raw).data ?? null;
}

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
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [gate, setGate] = useState<LessonOpenStep>("familiarity");
  const [familiarity, setFamiliarity] = useState<Familiarity>(DEFAULT_FAMILIARITY);
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);

  const activeTopic = useMemo(() => {
    const id = pickedId ?? initialTopicId;
    return (
      topics.find((topic) => topic.id === id) ??
      nextOpenTopic(topics) ??
      topics[0] ??
      null
    );
  }, [pickedId, topics, initialTopicId]);

  const seenInitial = useRef(initialTopicId);
  useEffect(() => {
    if (seenInitial.current === initialTopicId) return;
    seenInitial.current = initialTopicId;
    setPickedId(null);
  }, [initialTopicId]);

  const topicKey = activeTopic?.id ?? "";
  const seenTopic = useRef(topicKey);
  useEffect(() => {
    if (seenTopic.current === topicKey) return;
    seenTopic.current = topicKey;
    setGate("familiarity");
    setGenerateError(null);
    setGenerating(false);
  }, [topicKey]);

  const lesson = activeTopic ? (lessonsByTopic[activeTopic.id] ?? null) : null;
  const structured = useMemo(
    () => structuredLesson(lesson?.contentJson),
    [lesson?.contentJson],
  );
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
        body: JSON.stringify({
          prepId,
          topicId: activeTopic.id,
          familiarity,
          mood,
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = payload.error ?? "Ders üretilemedi.";
        setGenerateError(message);
        toast.error(message);
        return;
      }
      setGenerateError(null);
      toast.success("Ders hazır.");
      router.refresh();
    } catch {
      setGenerateError("Bağlantı kurulamadı. Lütfen yeniden dene.");
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
    <div className="cp-exam-page cp-exam-study">
      <div className="cp-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill">
          ← Konu yolu
        </Link>
        <span className="text-sm text-[var(--cp-muted)]">{prepTitle}</span>
      </div>

      <p className="cp-lesson-kicker">Konu seç</p>
      <ExamPrepPath
        prepId={prepId}
        topics={topics}
        activeId={activeTopic?.id}
        onSelect={(topicId) => {
          setPickedId(topicId);
          setGate("familiarity");
        }}
      />

      {activeTopic ? (
        <section className="cp-exam-topic-stage" key={activeTopic.id}>
          <h1>{activeTopic.label}</h1>
          {lesson || activeTopic.status === "done" ? (
            <p className="text-sm text-[var(--cp-muted)]">
              {activeTopic.status === "done"
                ? "Bu konuyu bitirdin. İstersen dersi tekrar oku veya sıradakine geç."
                : "Dersi oku, sonra konuyu tamamla — sonraki açılır."}
            </p>
          ) : null}

          {lesson ? (
            <>
              <h2 className="cp-exam-topic-lesson-title">{lesson.title}</h2>
              {/* Yapı varsa adım adım; yoksa (eski dersler) markdown. */}
              {structured ? (
                <ExamLessonSteps lesson={structured} />
              ) : (
                <ExamLessonBody content={lesson.contentMd} />
              )}
            </>
          ) : generating ? (
            <NodeGenerationProgress
              onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
            />
          ) : (
            <LessonOpenChrome
              step={gate}
              familiarity={familiarity}
              mood={mood}
              recommendedTitle={PLAN_NODE_META.lesson.setupLabel}
              blurb={PLAN_NODE_META.lesson.blurb}
              topicLabel={activeTopic.label}
              error={generateError}
              onFamiliarity={(level) => {
                setFamiliarity(level);
                setGate("mood");
              }}
              onMood={(next) => {
                setMood(next);
                setGate("recommend");
              }}
              onContinue={() => setGate("create")}
              onCreate={() => void generateLesson()}
            />
          )}
        </section>
      ) : (
        <p className="text-sm text-[var(--cp-muted)]">Önce bir konu seç.</p>
      )}

      <div className="cp-exam-study-footer">
        {lesson && activeTopic && activeTopic.status !== "done" ? (
          <button
            type="button"
            className="cp-exam-continue cp-exam-continue--primary"
            disabled={completing}
            onClick={() => void completeTopic()}
          >
            {completing ? "Kaydediliyor…" : "Konuyu tamamla"}
          </button>
        ) : null}
        {nextAfter && nextAfter.id !== activeTopic?.id ? (
          <button
            type="button"
            className="cp-exam-continue"
            onClick={() => {
              setPickedId(nextAfter.id);
              setGate("familiarity");
              router.push(
                `/deneme-sinavlari/${prepId}/calis?topic=${nextAfter.id}`,
                { scroll: false },
              );
            }}
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
