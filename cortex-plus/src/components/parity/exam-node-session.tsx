"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createSerialTaskQueue } from "@/lib/learning/serial-task-queue";
import { ExamNodeCoach } from "@/components/parity/exam-node-coach";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";
import { CreditGate } from "@/components/paywall/credit-gate";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  DEFAULT_FAMILIARITY,
  DEFAULT_MOOD,
  FAMILIARITY_OPTIONS,
  MOOD_OPTIONS,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import { cn } from "@/lib/utils";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import "@/styles/node-generation-progress.css";

type Difficulty = "kolay" | "orta" | "ileri";

type Payload = {
  type?: string;
  title?: string;
  contentMd?: string;
  /** Yapısal ders; yoksa contentMd'ye düşülür (eski kayıtlar). */
  lesson?: unknown;
  // Podcast senaryosu satır bazlı; biçim lib/learning/podcast-script.ts
  // tarafından normalleştiriliyor, eski script biçimi de kabul ediliyor.
  chapters?: unknown[];
  questions?: {
    text?: string;
    prompt?: string;
    options?: string[];
    multi?: boolean;
    correct?: string[];
    explanation?: string;
    hint?: string;
  }[];
  items?: { text: string; correct: boolean; explanation: string; correctedStatement?: string }[];
  cards?: { front: string; back: string }[];
};

export function ExamNodeSession({
  prepId,
  nodeId,
  kind,
  prepTitle,
  topicLabel,
  initialFamiliarity,
  resumeEnabled = false,
  sourceName = null,
}: {
  prepId: string;
  nodeId: string;
  kind: PlanNodeKind;
  prepTitle: string;
  topicLabel: string | null;
  /** Konuya daha önce girildiyse beyan edilen aşinalık — varsayılan olarak gelir. */
  initialFamiliarity?: Familiarity | null;
  /** Stage 8 — pdf_learning_v2: restore attempt + debounce + save answers. */
  resumeEnabled?: boolean;
  /** Hazırlık bir belgeye bağlıysa dosya adı — üretim ekranında gösterilir. */
  sourceName?: string | null;
}) {
  const router = useRouter();
  const meta = PLAN_NODE_META[kind];
  // Astra'daki sıra: aşinalık → ruh hali → kurulum. İkisi de zorunlu değil;
  // "setup"tan geri dönülebilsin diye aynı stage makinesinde tutuluyorlar.
  const [stage, setStage] = useState<
    "familiarity" | "mood" | "setup" | "play" | "result" | "restoring"
  >(resumeEnabled ? "restoring" : "familiarity");
  const [familiarity, setFamiliarity] = useState<Familiarity>(
    initialFamiliarity ?? DEFAULT_FAMILIARITY,
  );
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);
  const [difficulty, setDifficulty] = useState<Difficulty>("orta");
  const [voiceMode, setVoiceMode] = useState(meta.voice);
  const [loading, setLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [payload, setPayload] = useState<Payload>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(1);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ score: 0, total: 1 });
  const [nextHref, setNextHref] = useState(`/deneme-sinavlari/${prepId}`);
  const [feedback, setFeedback] = useState<{
    headline: string;
    note: string;
    gaps: string[];
    nextFocus: string[];
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [tfRevealed, setTfRevealed] = useState(false);
  /** Stage 6: which question indices showed a hint before submit. */
  const [hintsUsed, setHintsUsed] = useState<Record<string, boolean>>({});
  const startInFlight = useRef(false);
  const completeInFlight = useRef(false);
  const completeRequestIdRef = useRef<string | null>(null);
  const saveQueue = useRef(createSerialTaskQueue());
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const contentVersionRef = useRef(1);
  const answersRef = useRef<Record<string, unknown>>({});

  const isTimedExam = kind === "written_exam";
  const [timeLeft, setTimeLeft] = useState(15 * 60);

  useEffect(() => {
    if (!pendingSaves && !saveError) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingSaves, saveError]);

  useEffect(() => {
    contentVersionRef.current = contentVersion;
  }, [contentVersion]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!resumeEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, action: "resume" }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.resumed && data.attemptId && data.payload) {
          applyStartPayload(data);
          setStage("play");
          return;
        }
      } catch {
        // Fall through to normal setup.
      }
      if (!cancelled) setStage("familiarity");
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeEnabled, prepId, nodeId]);

  useEffect(() => {
    if (stage !== "play" || !isTimedExam) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, isTimedExam]);

  function storageKey() {
    return `exam-node-req:${prepId}:${nodeId}`;
  }

  function getOrCreateClientRequestId() {
    if (typeof window === "undefined") return crypto.randomUUID();
    const existing = sessionStorage.getItem(storageKey());
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(storageKey(), id);
    return id;
  }

  function clearClientRequestId() {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(storageKey());
  }

  function applyStartPayload(data: {
    attemptId?: string;
    generationId?: string;
    clientRequestId?: string;
    contentVersion?: number;
    payload?: Payload;
    answers?: Record<string, unknown>;
    cursorIndex?: number;
    voiceMode?: boolean;
  }) {
    setPayload(data.payload ?? {});
    setAttemptId(data.attemptId ?? null);
    setGenerationId(data.generationId ?? null);
    if (data.clientRequestId) setClientRequestId(data.clientRequestId);
    const ver = data.contentVersion ?? 1;
    setContentVersion(ver);
    contentVersionRef.current = ver;
    if (data.answers && typeof data.answers === "object") {
      setAnswers(data.answers);
      answersRef.current = data.answers;
    }
    if (typeof data.cursorIndex === "number") setIndex(data.cursorIndex);
    if (typeof data.voiceMode === "boolean") setVoiceMode(data.voiceMode);
  }

  function scheduleSave(nextAnswers: Record<string, unknown>, cursor: number) {
    if (!resumeEnabled || !attemptId || !generationId) return;
    void persistAnswers(nextAnswers, cursor).catch(() => undefined);
  }

  async function persistAnswers(
    nextAnswers: Record<string, unknown>,
    cursor: number,
  ) {
    if (!resumeEnabled || !attemptId || !generationId) return;
    setPendingSaves((n) => n + 1);
    return saveQueue.current.run(async () => {
      try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "save",
          attemptId,
          generationId,
          contentVersion: contentVersionRef.current,
          answers: nextAnswers,
          cursorIndex: cursor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.contentVersion !== "number") {
        throw Object.assign(new Error(data.error === "stale_version"
          ? "Bu ders başka bir sekmede değişti. Devam etmeden sayfayı yenile."
          : "Cevapların kaydedilemedi. Bağlantını kontrol edip kaydı yeniden dene."), { code: data.error });
      }
      if (res.ok && typeof data.contentVersion === "number") {
        setContentVersion(data.contentVersion);
        contentVersionRef.current = data.contentVersion;
        setSaveError(null);
      }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Cevapların kaydedilemedi.");
        throw error;
      } finally { setPendingSaves((n) => n - 1); }
    });
  }

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function start() {
    if (startInFlight.current || loading) return;
    startInFlight.current = true;
    setLoading(true);
    setGenerationError(null);
    try {
      const reqId = resumeEnabled ? getOrCreateClientRequestId() : undefined;
      if (reqId) setClientRequestId(reqId);
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "start",
          difficulty,
          voiceMode,
          familiarity,
          mood,
          ...(reqId ? { clientRequestId: reqId } : {}),
        }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "generation_failed_retry") {
          clearClientRequestId();
        }
        setGenerationError(data.error === "generation_in_progress"
          ? "Dersin hâlâ hazırlanıyor. Biraz sonra yeniden dene; ikinci bir üretim başlatılmayacak."
          : data.error === "content_verification_failed"
          ? "Hazırlanan içerik kalite kontrolünü geçemedi. Yeniden deneyebilirsin."
          : "Ders şu anda oluşturulamadı. Yeniden deneyebilirsin.");
        return;
      }
      applyStartPayload(data);
      setStage("play");
    } catch {
      setGenerationError("Bağlantı kurulamadı. Lütfen yeniden dene.");
    } finally {
      setLoading(false);
      startInFlight.current = false;
    }
  }

  async function finish(nextAnswers?: Record<string, unknown>) {
    if (completeInFlight.current || loading) return;
    completeInFlight.current = true;
    setLoading(true);
    try {
      const base = nextAnswers ?? answersRef.current;
      if (resumeEnabled && attemptId && generationId) {
        try { await persistAnswers(base, index); }
        catch (error) {
          // A lost completion response can leave the server already completed.
          // Let the idempotent complete endpoint return its saved result.
          if (!(error && typeof error === "object" && "code" in error && error.code === "attempt_not_active")) throw error;
        }
      }
      if (!completeRequestIdRef.current) {
        completeRequestIdRef.current = crypto.randomUUID();
      }
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepId,
          nodeId,
          action: "complete",
          attemptId: attemptId ?? undefined,
          generationId: generationId ?? undefined,
          clientRequestId: clientRequestId ?? undefined,
          completeRequestId: resumeEnabled
            ? completeRequestIdRef.current
            : undefined,
          answers: {
            ...base,
            __meta: { hintsUsed },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi.");
        return;
      }
      clearClientRequestId();
      setSaveError(null);
      completeRequestIdRef.current = null;
      setScore({ score: data.score ?? 0, total: data.total ?? 1 });
      setNextHref(data.nextHref ?? `/deneme-sinavlari/${prepId}`);
      setFeedback(null);
      setStage("result");
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
      completeInFlight.current = false;
    }
  }

  function updateAnswer(key: string, value: unknown) {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    scheduleSave(next, Number(key) || index);
  }

  function markHint(index: number) {
    setHintsUsed((prev) => ({ ...prev, [String(index)]: true }));
  }

  async function loadFeedback() {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Geri bildirim alınamadı.");
        return;
      }
      setFeedback(data.feedback ?? null);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  const questions = payload.questions ?? [];
  const items = payload.items ?? [];
  const cards = payload.cards ?? [];
  const chapters = payload.chapters ?? [];
  // Şema tutmazsa düz markdown'a düşülür; ders hiç açılmamasındansa
  // biçimsiz açılsın.
  const structuredLesson = useMemo(
    () => (payload.lesson ? lessonV2Schema.safeParse(payload.lesson).data ?? null : null),
    [payload.lesson],
  );
  const coachItem =
    payload.type === "quiz"
      ? questions[index]?.text
      : payload.type === "true_false"
        ? items[index]?.text
        : payload.type === "cards"
          ? cards[index]?.front
          : payload.type === "oral"
            ? questions[index]?.prompt
            : payload.type === "lesson"
              ? payload.title
              : null;
  const showCoach =
    stage === "play" &&
    Boolean(coachItem) &&
    payload.type !== "voice" &&
    payload.type !== "podcast";

  return (
    <div className="ap-exam-page ap-exam-node">
      {pendingSaves > 0 ? <p role="status" className="text-sm">Cevapların kaydediliyor…</p> : null}
      {saveError ? <div role="alert" className="text-sm text-red-400">
        <p>{saveError}</p>
        <button type="button" className="underline" disabled={pendingSaves > 0}
          onClick={() => { void persistAnswers(answersRef.current, index).catch(() => undefined); }}>Kaydı yeniden dene</button>
      </div> : null}
      <div className="ap-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="ap-back-pill"
          onClick={(event) => { if (pendingSaves || saveError) { event.preventDefault(); toast.error("Çıkmadan önce cevapların kaydedilmesini bekle."); } }}>
          ← Geri
        </Link>
        {stage === "play" && isTimedExam ? (
          <span className={cn("ap-exam-timer", timeLeft < 120 && "ap-exam-timer--urgent")}>
            ⏱ {formatTimer(timeLeft)}
          </span>
        ) : null}
        <button type="button" className="ap-back-pill" disabled={pendingSaves > 0 || Boolean(saveError)} onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
          ×
        </button>
      </div>

      {stage === "restoring" ? (
        <section className="ap-exam-setup" aria-busy="true" aria-live="polite">
          <p className="ap-lesson-kicker">Devam</p>
          <h1>Kaldığın yer açılıyor…</h1>
          <p className="text-sm text-[var(--ap-muted)]">
            Kaydedilmiş cevapların yükleniyor. Yeniden ücret alınmaz — yarım kalan
            oturum güvenle sürer.
          </p>
          <p className="text-xs text-[var(--ap-muted)]" role="status">
            Bu ekran boş değil; kısa süre sonra sorulara döneceksin.
          </p>
        </section>
      ) : null}

      {stage === "familiarity" || stage === "mood" ? (
        <article className="ap-signal-card">
          <div className="ap-signal-steps" aria-hidden>
            <span className="ap-signal-step ap-signal-step--on" />
            <span
              className={cn(
                "ap-signal-step",
                stage === "mood" && "ap-signal-step--on",
              )}
            />
          </div>
          {stage === "familiarity" ? (
            <>
              <h1>Bu konuya ne kadar aşinasın?</h1>
              <p className="ap-signal-lead">
                Doğru zorluk seviyesini belirlememize yardımcı olur.
              </p>
              {FAMILIARITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="ap-signal-option"
                  aria-pressed={familiarity === option.id}
                  onClick={() => {
                    setFamiliarity(option.id);
                    setStage("mood");
                  }}
                >
                  <span className="ap-signal-emoji" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="ap-signal-title">{option.title}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <h1>Bugün ruh halin nasıl?</h1>
              <p className="ap-signal-lead">
                Anlatım tonunu buna göre ayarlayacağım.
              </p>
              {MOOD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="ap-signal-option"
                  aria-pressed={mood === option.id}
                  onClick={() => {
                    setMood(option.id);
                    setStage("setup");
                  }}
                >
                  <span className="ap-signal-emoji" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="ap-signal-title">{option.title}</span>
                </button>
              ))}
            </>
          )}
        </article>
      ) : null}

      {stage === "setup" && loading ? (
        <NodeGenerationProgress sourceName={sourceName} />
      ) : null}

      {stage === "setup" && !loading ? (
        <article className="ap-exam-setup-card">
          <p className="ap-lesson-kicker">{prepTitle}</p>
          <h1>{meta.setupLabel}</h1>
          {topicLabel ? <p className="text-sm text-[var(--ap-muted)]">{topicLabel}</p> : null}
          <label className="ap-field">
            <span>Zorluk seviyesi belirle</span>
            <strong className="ap-exam-diff-label">
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
          {meta.voice ? (
            <label className="ap-exam-voice-row">
              <span>
                Sesli mod
                <em>Yazmak yerine konuş</em>
              </span>
              <input
                type="checkbox"
                checked={voiceMode}
                onChange={(event) => setVoiceMode(event.target.checked)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            disabled={loading}
            onClick={() => void start()}
          >
            {loading ? "Hazırlanıyor…" : "Ders oluştur"}
          </button>
          {generationError ? <p role="alert" className="text-sm text-red-400">{generationError}</p> : null}
        </article>
      ) : null}

      {stage === "play" && payload.type === "voice" ? (
        <ExamVoiceTutor
          prepId={prepId}
          nodeId={nodeId}
          kind={kind === "oral" ? "oral" : "qa"}
          topicLabel={topicLabel ?? prepTitle}
          difficulty={difficulty}
          returnPath={`/deneme-sinavlari/${prepId}`}
          onFinish={(turns) => {
            void finish({ "0": turns > 0 ? "sesli yanıt" : "" });
          }}
        />
      ) : null}

      {stage === "play" && payload.type === "lesson" ? (
        structuredLesson ? (
          // Yapısal ders adım adım gelir: her bölüm kendi kontrolüyle
          // biter ve öğrenci cevaplamadan ilerleyemez.
          <ExamLessonSteps lesson={structuredLesson} onFinish={() => void finish()} />
        ) : (
          <section>
            <h1>{payload.title}</h1>
            <ExamLessonBody content={payload.contentMd ?? ""} />
            <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={() => void finish()}>
              Bitir
            </button>
          </section>
        )
      ) : null}

      {stage === "play" && payload.type === "podcast" ? (
        <ExamPodcastPlayer
          title={payload.title ?? "Podcast"}
          chapters={chapters}
          finishing={loading}
          onFinish={() => void finish()}
        />
      ) : null}

      {stage === "play" && payload.type === "quiz" && questions[index] ? (
        <ExamQuizPlay
          questions={questions.map((question) => ({
            text: question.text ?? "",
            options: question.options ?? [],
            multi: Boolean(question.multi),
            correct: question.correct,
            explanation: question.explanation,
          }))}
          index={index}
          value={answers[String(index)]}
          onChange={(value) => updateAnswer(String(index), value)}
          onContinue={() => {
            if (index + 1 < questions.length) setIndex(index + 1);
            else void finish();
          }}
          continueLabel={index + 1 < questions.length ? "İleri" : "Bitir"}
          disabled={loading}
        />
      ) : null}

      {stage === "play" && payload.type === "true_false" && items[index] ? (
        <section>
          <p className="ap-lesson-kicker">
            {index + 1}/{items.length}
          </p>
          <h1>{items[index].text}</h1>
          <div className="flex gap-2">
            {([true, false] as const).map((value) => {
              const isSelected = answers[String(index)] === value;
              const isItemCorrect = items[index].correct === value;
              const showGreen = tfRevealed && isItemCorrect;
              const showRed = tfRevealed && isSelected && !isItemCorrect;

              return (
                <button
                  key={String(value)}
                  type="button"
                  disabled={tfRevealed}
                  className={cn(
                    "ap-exam-continue",
                    isSelected && "ap-exam-continue--primary",
                    showGreen && "border-emerald-500 bg-emerald-500/20 text-emerald-300",
                    showRed && "border-rose-500 bg-rose-500/20 text-rose-300",
                  )}
                  onClick={() => {
                    updateAnswer(String(index), value);
                    setTfRevealed(true);
                  }}
                >
                  {value ? "Doğru" : "Yanlış"}
                </button>
              );
            })}
          </div>

          {tfRevealed ? (
            <div className="ap-exam-quiz-feedback">
              <div
                className={cn(
                  "ap-exam-quiz-verdict",
                  answers[String(index)] === items[index].correct
                    ? "ap-exam-quiz-verdict--ok"
                    : "ap-exam-quiz-verdict--bad",
                )}
              >
                {answers[String(index)] === items[index].correct ? "✓ Doğru!" : "✕ Yanlış"}
              </div>
              {!items[index].correct && items[index].correctedStatement ? (
                <p className="ap-exam-quiz-explain"><strong>Doğru ifade:</strong> {items[index].correctedStatement}</p>
              ) : null}
              {items[index].explanation ? (
                <p className="ap-exam-quiz-explain">{items[index].explanation}</p>
              ) : null}
              <button
                type="button"
                className="ap-exam-continue ap-exam-continue--primary mt-2"
                onClick={() => {
                  setTfRevealed(false);
                  if (index + 1 < items.length) setIndex(index + 1);
                  else void finish();
                }}
              >
                {index + 1 < items.length ? "Sonraki soru" : "Bitir"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {stage === "play" && payload.type === "cards" && cards[index] ? (
        <section className="ap-exam-card-stage">
          <p className="ap-lesson-kicker">
            {index + 1}/{cards.length}
          </p>
          <button type="button" className="ap-exam-flash" onClick={() => setFlipped((value) => !value)}>
            {flipped ? cards[index].back : cards[index].front}
          </button>
          <p className="text-sm text-[var(--ap-muted)]">Kartı çevirmek için tıkla</p>
          <p>Cevabı biliyor musun?</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ap-exam-continue"
              onClick={() => {
                const nextAnswers = { ...answersRef.current, [String(index)]: false };
                updateAnswer(String(index), false);
                setFlipped(false);
                if (index + 1 < cards.length) setIndex(index + 1);
                else void finish(nextAnswers);
              }}
            >
              Hayır
            </button>
            <button
              type="button"
              className="ap-exam-continue ap-exam-continue--primary"
              onClick={() => {
                const nextAnswers = { ...answersRef.current, [String(index)]: true };
                updateAnswer(String(index), true);
                setFlipped(false);
                if (index + 1 < cards.length) setIndex(index + 1);
                else void finish(nextAnswers);
              }}
            >
              Evet
            </button>
          </div>
        </section>
      ) : null}

      {stage === "play" && payload.type === "oral" && questions[index] ? (
        <section>
          <p className="ap-lesson-kicker">
            {index + 1}/{questions.length}
          </p>
          <h1>{questions[index].prompt}</h1>
          {questions[index].hint ? (
            hintsUsed[String(index)] ? (
              <p className="text-sm text-[var(--ap-muted)]">İpucu: {questions[index].hint}</p>
            ) : (
              <button
                type="button"
                className="text-sm text-[var(--ap-muted)] underline"
                onClick={() => markHint(index)}
              >
                İpucu göster
              </button>
            )
          ) : null}
          <textarea
            className="ap-exam-oral-input"
            rows={4}
            placeholder={voiceMode ? "Konuşarak veya yazarak yanıtla" : "Yanıtın"}
            value={String(answers[String(index)] ?? "")}
            onChange={(event) =>
              updateAnswer(String(index), event.target.value)
            }
          />
          <button
            type="button"
            className="ap-exam-continue ap-exam-continue--primary"
            onClick={() => {
              if (index + 1 < questions.length) setIndex(index + 1);
              else void finish();
            }}
          >
            {index + 1 < questions.length ? "Sonraki soru" : "Bitir"}
          </button>
        </section>
      ) : null}

      {stage === "result" ? (
        <section className="ap-exam-node-result">
          <p className="ap-lesson-kicker">Doğru cevaplar</p>
          <p className="ap-exam-score-xl">
            {score.score}/{score.total}
          </p>
          <p>{score.total && score.score / score.total >= 0.7 ? "Güzel gidiyor" : "Biraz daha gelişebilirsin"}</p>
          <p className="text-sm text-[var(--ap-muted)]">
            Doğruluk {Math.round((score.score / Math.max(1, score.total)) * 100)}%
            {" · "}Bu oturum skoru program ilerlemesinden ve sınava hazırlık tahmininden ayrıdır.
          </p>
          {resumeEnabled ? (
            <p className="text-sm">
              <Link
                href={`/deneme-sinavlari/${prepId}/tekrarlar`}
                className="underline"
              >
                Yanlışlar ve tekrarlar
              </Link>
              {" · "}
              <Link
                href={`/deneme-sinavlari/${prepId}/degerlendirme`}
                className="underline"
              >
                Sınav öncesi değerlendirme
              </Link>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ap-exam-continue" onClick={() => {
              setStage("setup");
              setIndex(0);
              setAnswers({});
              setFeedback(null);
            }}>
              Dersi tekrarla
            </button>
            <button
              type="button"
              className="ap-exam-continue"
              disabled={feedbackLoading}
              onClick={() => void loadFeedback()}
            >
              {feedbackLoading ? "Yazıyor…" : "Eğitmeninden geri bildirim"}
            </button>
          </div>
          {feedback ? (
            <article className="ap-exam-debrief">
              <p className="ap-lesson-kicker">Eğitmen notu</p>
              <h2>{feedback.headline}</h2>
              <p>{feedback.note}</p>
              {feedback.gaps.length ? (
                <>
                  <p className="ap-exam-debrief-label">Zayıf noktalar</p>
                  <ul>
                    {feedback.gaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {feedback.nextFocus.length ? (
                <>
                  <p className="ap-exam-debrief-label">Bundan sonra</p>
                  <ul>
                    {feedback.nextFocus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ) : null}
          <Link href={nextHref} className="ap-exam-continue ap-exam-continue--primary">
            Devam et
          </Link>
        </section>
      ) : null}

      {showCoach && coachItem ? (
        <ExamNodeCoach
          key={`${payload.type}-${index}`}
          prepId={prepId}
          nodeId={nodeId}
          itemText={coachItem}
          returnPath={`/deneme-sinavlari/${prepId}`}
        />
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu ders için kredin kalmadı."
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
