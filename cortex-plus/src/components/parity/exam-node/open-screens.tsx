"use client";

/** Açılış ekranları: aşinalık, ruh hali, öneri; kurulum kartı ve hazırlanıyor ekranı. */
import { BUSY_NOTE } from "@/lib/learning/generation-retry";
import { showsSlowWarning } from "@/lib/learning/quiz-delivery";
import { NodeGenerationProgress, preparingTitle } from "@/components/parity/node-generation-progress";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";
import { difficultyFromFamiliarity, stepAfterMood } from "@/lib/learning/lesson-open";
import { activityDurationMinutes } from "@/lib/learning/activity-duration";
import { startActionLabel } from "@/lib/learning/feedback-copy";
import { PodcastFormatPicker } from "@/components/parity/podcast-format-picker";
import Link from "next/link";
import { VOICE_MODE_GATE } from "./gates";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function OpenSignals({ life }: { life: NodeLifecycle }) {
  const { kind, todayMood, reviewSaved, unitTitle, activityMinutes, topicLabel, meta, stage, setStage, familiarity, setFamiliarity, mood, setMood, setDifficulty, start } = life;
  return (
    <>
      {!reviewSaved && (stage === "familiarity" || stage === "mood") ? (
        <LessonOpenChrome
          step={stage}
          familiarity={familiarity}
          mood={mood}
          recommendedTitle={meta.setupLabel}
          topicLabel={unitTitle ?? topicLabel}
          onFamiliarity={(level) => {
            setFamiliarity(level);
            setDifficulty(difficultyFromFamiliarity(level));
            setStage(todayMood ? stepAfterMood(kind) : "mood");
          }}
          onMood={(next) => {
            setMood(next);
            setStage(stepAfterMood(kind));
          }}
          onContinue={() => setStage("setup")}
          onCreate={() => void start()}
        />
      ) : null}

      {!reviewSaved && stage === "recommend" ? (
        <LessonOpenChrome
          step="recommend"
          recommendedTitle={meta.setupLabel}
          blurb={meta.blurb}
          minutes={
            typeof activityMinutes === "number" && activityMinutes > 0
              ? activityDurationMinutes(kind, { known: activityMinutes })
              : null
          }
          topicLabel={unitTitle ?? topicLabel}
          onFamiliarity={() => undefined}
          onMood={() => undefined}
          onContinue={() => setStage("setup")}
          onCreate={() => void start()}
        />
      ) : null}
    </>
  );
}

export function SetupScreens({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, kind, prepTitle, reviewSaved, rewriteHref, sourceName, unitTitle, activityMinutes, router, topicLabel, meta, stage, setStage, familiarity, difficulty, setDifficulty, podcastLength, setPodcastLength, voiceLocked, voiceMode, setVoiceMode, loading, generationError, queueNote, generationFailure, setPaywall, setPaywallGate, start } = life;
  return (
    <>
      {stage === "setup" && !loading && reviewSaved && generationError ? (
        <section className="cp-exam-empty" role="status">
          <p>{generationError}</p>
          <Link href={`/deneme-sinavlari/${prepId}/dugum/${nodeId}/sonuc`} className="cp-exam-continue">
            Sonuca dön
          </Link>
          {/* Kayıtlı ders bulunamadıysa yeni anlatım yine açık seçim (30 Ekim 2026): kendiliğinden yazılmaz. */}
          {kind === "lesson" && rewriteHref ? (
            <Link href={rewriteHref} className="cp-exam-continue">
              Farklı anlat
            </Link>
          ) : null}
        </section>
      ) : null}

      {stage === "setup" && (loading || (reviewSaved && !generationError)) && kind !== "readiness" ? (
        <NodeGenerationProgress
          title={reviewSaved ? "Kayıtlı içerik açılıyor" : preparingTitle(kind)}
          sourceName={sourceName}
          topic={topicLabel}
          note={queueNote ? BUSY_NOTE : undefined}
          warnSlow={showsSlowWarning(kind)}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {stage === "setup" && loading && kind === "readiness" ? (
        <section className="cp-readiness" aria-busy="true">
          <h1>Hazırlık durumun hesaplanıyor</h1>
          <p>Kayıtlı ilerlemeden okunuyor. Yeni soru üretilmiyor.</p>
        </section>
      ) : null}

      {stage === "setup" && !loading && kind === "lesson" && !reviewSaved ? (
        <LessonOpenChrome
          step="create"
          recommendedTitle={meta.setupLabel}
          minutes={
            typeof activityMinutes === "number" && activityMinutes > 0
              ? activityDurationMinutes(kind, { known: activityMinutes })
              : null
          }
          topicLabel={unitTitle ?? topicLabel}
          familiarity={familiarity}
          onChangeLevel={() => setStage("familiarity")}
          busy={loading}
          canCreate={!generationFailure || generationFailure.canRetryNow}
          error={generationError}
          action={generationFailure?.action ?? null}
          onFamiliarity={() => undefined}
          onMood={() => undefined}
          onContinue={() => setStage("setup")}
          onCreate={() => void start()}
        />
      ) : null}

      {stage === "setup" && !loading && kind !== "lesson" && !reviewSaved ? (
        <article className="cp-exam-setup-card">
          <p className="cp-lesson-kicker">{prepTitle}</p>
          <h1>{meta.setupLabel}</h1>
          {topicLabel ? <p className="text-sm text-[var(--cp-muted)]">{topicLabel}</p> : null}
          <label className="cp-field">
            <span>Zorluk seviyesi belirle</span>
            <strong className="cp-exam-diff-label">
              {difficulty === "kolay" ? "Kolay" : difficulty === "ileri" ? "İleri" : "Orta"}
            </strong>
            <input
              type="range"
              min={0}
              max={2}
              value={difficulty === "kolay" ? 0 : difficulty === "ileri" ? 2 : 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDifficulty(value === 0 ? "kolay" : value === 2 ? "ileri" : "orta");
              }}
            />
          </label>
          {kind === "podcast" ? (
            <PodcastFormatPicker value={podcastLength} onChange={setPodcastLength} />
          ) : null}
          {meta.voice ? (
            <label className="cp-exam-voice-row">
              <span>
                Sesli mod
                <em>{voiceLocked ? "Plus'ta · ücretsiz hesapta yazarak sorarsın" : "Yazmak yerine konuş"}</em>
              </span>
              <input
                type="checkbox"
                checked={voiceMode}
                onChange={(event) => {
                  // Ücretsiz hesapta açmak kapıyı açar: hemen söylemek, ilk cevapta düşmekten iyi.
                  if (event.target.checked && voiceLocked) {
                    setPaywallGate(VOICE_MODE_GATE);
                    setPaywall(true);
                    return;
                  }
                  setVoiceMode(event.target.checked);
                }}
              />
            </label>
          ) : null}
          {generationFailure && !generationFailure.canRetryNow ? null : (
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              disabled={loading}
              onClick={() => void start()}
            >
              {loading ? "Hazırlanıyor…" : startActionLabel(kind)}
            </button>
          )}
          {generationError ? (
            <p role="alert" className="text-sm text-red-400">
              {generationError}
            </p>
          ) : null}
          {generationFailure?.action ? (
            <Link
              href={generationFailure.action.href}
              className="cp-exam-continue inline-flex"
            >
              {generationFailure.action.label}
            </Link>
          ) : null}
        </article>
      ) : null}
    </>
  );
}
