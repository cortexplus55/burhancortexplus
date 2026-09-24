"use client";

import Link from "next/link";
import {
  FAMILIARITY_OPTIONS,
  MOOD_OPTIONS,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import { LESSON_OPEN_COPY } from "@/lib/learning/lesson-open";
import { cn } from "@/lib/utils";

export type LessonOpenStep = "familiarity" | "mood" | "recommend" | "create";

/**
 * Ders düğümü ve konu okuyucusunun ortak açılış kartları.
 * Üretim burada başlamaz; çağıran "Ders oluştur" ile başlatır.
 */
export function LessonOpenChrome({
  step,
  familiarity,
  mood,
  recommendedTitle,
  blurb,
  topicLabel,
  busy = false,
  canCreate = true,
  error,
  action,
  onFamiliarity,
  onMood,
  onContinue,
  onCreate,
}: {
  step: LessonOpenStep;
  familiarity?: Familiarity;
  mood?: Mood;
  recommendedTitle: string;
  blurb?: string | null;
  topicLabel?: string | null;
  busy?: boolean;
  canCreate?: boolean;
  error?: string | null;
  action?: { href: string; label: string } | null;
  onFamiliarity: (level: Familiarity) => void;
  onMood: (mood: Mood) => void;
  onContinue: () => void;
  onCreate: () => void;
}) {
  if (step === "familiarity" || step === "mood") {
    return (
      <article className="cp-signal-card">
        <div className="cp-signal-steps" aria-hidden>
          <span className="cp-signal-step cp-signal-step--on" />
          <span
            className={cn(
              "cp-signal-step",
              step === "mood" && "cp-signal-step--on",
            )}
          />
        </div>
        {step === "familiarity" ? (
          <>
            <h1>{LESSON_OPEN_COPY.familiarityTitle}</h1>
            <p className="cp-signal-lead">{LESSON_OPEN_COPY.familiarityLead}</p>
            {FAMILIARITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="cp-signal-option"
                aria-pressed={familiarity === option.id}
                onClick={() => onFamiliarity(option.id)}
              >
                <span className="cp-signal-emoji" aria-hidden>
                  {option.emoji}
                </span>
                <span className="cp-signal-title">{option.title}</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <h1>{LESSON_OPEN_COPY.moodTitle}</h1>
            <p className="cp-signal-lead">{LESSON_OPEN_COPY.moodLead}</p>
            {MOOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="cp-signal-option"
                aria-pressed={mood === option.id}
                onClick={() => onMood(option.id)}
              >
                <span className="cp-signal-emoji" aria-hidden>
                  {option.emoji}
                </span>
                <span className="cp-signal-title">{option.title}</span>
              </button>
            ))}
          </>
        )}
      </article>
    );
  }

  if (step === "recommend") {
    return (
      <article className="cp-exam-setup-card cp-exam-reco">
        <p className="cp-exam-reco-kicker">{LESSON_OPEN_COPY.recommendedKicker}</p>
        <h2>{recommendedTitle}</h2>
        {blurb ? <p className="cp-signal-lead">{blurb}</p> : null}
        {topicLabel ? <p className="text-sm text-[var(--cp-muted)]">{topicLabel}</p> : null}
        <button type="button" className="cp-exam-reco-go" onClick={onContinue}>
          {LESSON_OPEN_COPY.recommendedContinue}
        </button>
      </article>
    );
  }

  return (
    <article className="cp-exam-setup-card">
      <p className="cp-lesson-kicker">{LESSON_OPEN_COPY.recommendedKicker}</p>
      <h1>{LESSON_OPEN_COPY.exploreTitle}</h1>
      <p className="cp-signal-lead">{LESSON_OPEN_COPY.exploreLead}</p>
      {topicLabel ? <p className="text-sm text-[var(--cp-muted)]">{topicLabel}</p> : null}
      {canCreate ? (
        <button
          type="button"
          className="cp-exam-continue cp-exam-continue--primary"
          disabled={busy}
          onClick={onCreate}
        >
          {busy ? "Hazırlanıyor…" : LESSON_OPEN_COPY.create}
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {action ? (
        <Link href={action.href} className="cp-exam-continue inline-flex">
          {action.label}
        </Link>
      ) : null}
    </article>
  );
}
