"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createSerialTaskQueue } from "@/lib/learning/serial-task-queue";
import {
  describeGenerationFailure,
  generationFailureCode,
  type GenerationFailure,
} from "@/lib/learning/generation-failure";
import { ExamNodeCoach } from "@/components/parity/exam-node-coach";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { lessonV2Schema } from "@/lib/learning/teaching-standards";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { ExamReadinessScreen } from "@/components/parity/exam-readiness-screen";
import { ExamWrittenReview } from "@/components/parity/exam-written-review";
import type { ReadinessScreen } from "@/lib/learning/readiness-screen";
import type { WrittenExamReview } from "@/lib/learning/written-exam-review";
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";
import { OralAnswerDesk } from "@/components/parity/oral-answer-desk";
import {
  OralAnswerReview,
  OralPreflightDialog,
  OralResults,
  OralReviewTimeDialog,
  OralTeacherCustomize,
  OralTopicPick,
  type OralTopicRow,
} from "@/components/parity/oral-exam-flow";
import {
  DEFAULT_ORAL_TEACHER_MOOD,
  oralTeacherById,
  EMPTY_ORAL_ANSWER_NOTE,
  ORAL_PREFLIGHT,
  oralVoicePercent,
  oralVoiceTopicLabel,
  oralWrittenPercent,
  reviewItemsFromQuestions,
  reviewItemsFromTranscript,
  type OralMessage,
  type OralTeacherMoodId,
} from "@/lib/learning/oral-exam-chrome";
import {
  minutesForOralLength,
  ORAL_ALL_TOPICS,
  oralReviewItemFromGrade,
  type OralExamReport,
  type OralLength,
  type OralProbeKind,
} from "@/lib/learning/oral-exam";
import { CreditGate } from "@/components/paywall/credit-gate";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { topicLabelsMatch } from "@/lib/learning/study-tools";
import { normalizeChapters } from "@/lib/learning/podcast-script";
import {
  DEFAULT_FAMILIARITY,
  DEFAULT_MOOD,
  type Familiarity,
  type Mood,
} from "@/lib/learning/session-signals";
import { cn } from "@/lib/utils";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";
import {
  difficultyFromFamiliarity,
  stepAfterMood,
} from "@/lib/learning/lesson-open";
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
  length?: string;
  questions?: {
    text?: string;
    prompt?: string;
    options?: string[];
    multi?: boolean;
    correct?: string[];
    explanation?: string;
    optionWhy?: string[];
    misconceptionTag?: string;
    hint?: string;
    expectedPoints?: string[];
    probeKind?: OralProbeKind;
  }[];
  items?: { text: string; correct: boolean; explanation: string; correctedStatement?: string }[];
  cards?: { front: string; back: string }[];
  practice?: string;
  reused?: boolean;
  uncoveredTopics?: string[];
  message?: string;
  screen?: ReadinessScreen;
};

export function ExamNodeSession({
  prepId,
  nodeId,
  kind,
  prepTitle,
  topicLabel,
  requestedTopic = null,
  topicId = null,
  initialFamiliarity,
  resumeEnabled = false,
  sourceName = null,
  resetsAtLabel = null,
  oralTopics = [],
  language = "tr",
}: {
  prepId: string;
  nodeId: string;
  kind: PlanNodeKind;
  prepTitle: string;
  topicLabel: string | null;
  /** Ders oluşturma merkezinden gelen konu. Üretim bu etiketi kullanır. */
  requestedTopic?: string | null;
  /** Sesli tekrar bu konunun dersinden türetiliyor. */
  topicId?: string | null;
  /** Konuya daha önce girildiyse beyan edilen aşinalık — varsayılan olarak gelir. */
  initialFamiliarity?: Familiarity | null;
  /** Stage 8 — pdf_learning_v2: restore attempt + debounce + save answers. */
  resumeEnabled?: boolean;
  /** Hazırlık bir belgeye bağlıysa dosya adı — üretim ekranında gösterilir. */
  sourceName?: string | null;
  /**
   * Hakkın ne zaman yenileneceği — "12 Eylül 2026 03:00".
   *
   * Hakkı biten öğrenciye yalnızca "yükselt" demek eksik cevap: beklemek de
   * çözüyor ve bunu saklamak doğru olmaz.
   */
  resetsAtLabel?: string | null;
  /** Sözlü deneme konu listesi. Boşsa düğümün kendi konusu tek satır olur. */
  oralTopics?: OralTopicRow[];
  /** Hazırlık dili — ders sonu tekrarı bu dilde kurulur. */
  language?: "tr" | "en";
}) {
  const router = useRouter();
  const meta = PLAN_NODE_META[kind];
  // Referans üründeki sıra: aşinalık → ruh hali → kurulum. İkisi de zorunlu değil;
  // "setup"tan geri dönülebilsin diye aynı stage makinesinde tutuluyorlar.
  const isOral = kind === "oral";
  const opensReadiness = kind === "readiness";
  const [stage, setStage] = useState<
    | "familiarity"
    | "mood"
    | "recommend"
    | "setup"
    | "play"
    | "result"
    | "restoring"
    | "oral-topics"
    | "oral-customize"
    | "oral-review-time"
    | "oral-review"
  >(resumeEnabled ? "restoring" : opensReadiness ? "setup" : isOral ? "oral-topics" : "familiarity");
  const [familiarity, setFamiliarity] = useState<Familiarity>(
    initialFamiliarity ?? DEFAULT_FAMILIARITY,
  );
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);
  const [difficulty, setDifficulty] = useState<Difficulty>("orta");
  const [podcastLength, setPodcastLength] = useState<"ozet" | "standart" | "derin">("standart");
  const [voiceMode, setVoiceMode] = useState(meta.voice);
  const [oralSelected, setOralSelected] = useState<string[]>(() => {
    if (!requestedTopic) return [];
    const hit = oralTopics.find((topic) => topicLabelsMatch(requestedTopic, topic.label));
    return hit ? [hit.id] : [];
  });
  const [oralMoodId, setOralMoodId] = useState<OralTeacherMoodId>(DEFAULT_ORAL_TEACHER_MOOD);
  const [oralLength, setOralLength] = useState<OralLength>(3);
  const [oralReport, setOralReport] = useState<OralExamReport | null>(null);
  const [oralPreflight, setOralPreflight] = useState(false);
  const [oralTranscript, setOralTranscript] = useState<OralMessage[]>([]);
  const [oralReviewIndex, setOralReviewIndex] = useState(0);
  const [oralReviewTab, setOralReviewTab] = useState<"ai" | "you">("ai");
  const [loading, setLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  /**
   * Hatanın kendisi, yalnızca metni değil.
   *
   * `canRetryNow` hesaplanıyordu ama arayüz onu hiç okumuyordu: hakkı biten
   * öğrenciye de, üretimi süren öğrenciye de çalışmayan bir "Ders oluştur"
   * düğmesi gösteriliyordu.
   */
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"credit" | "premium">("credit");
  const [payload, setPayload] = useState<Payload>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(1);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ score: 0, total: 1, retried: 0 });
  const [writtenReview, setWrittenReview] = useState<WrittenExamReview | null>(null);
  const [nextHref, setNextHref] = useState(`/deneme-sinavlari/${prepId}`);
  const [feedback, setFeedback] = useState<{
    headline: string;
    note: string;
    gaps: string[];
    nextFocus: string[];
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [tfRevealed, setTfRevealed] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [lessonPodcast, setLessonPodcast] = useState<{
    title: string;
    chapters: unknown[];
  } | null>(null);
  /** Stage 6: which question indices showed a hint before submit. */
  const hintsUsed: Record<string, boolean> = {};
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
        if (kind === "written_exam") {
          const reviewRes = await fetch("/api/learning/exam-prep/node", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prepId, nodeId, action: "review" }),
          });
          const reviewData = await reviewRes.json().catch(() => ({}));
          if (!cancelled && reviewRes.ok && reviewData.review) {
            setWrittenReview(reviewData.review);
            setScore({
              score: reviewData.score ?? reviewData.review.score ?? 0,
              total: reviewData.total ?? reviewData.review.total ?? 1,
              retried: reviewData.retried ?? 0,
            });
            setStage("result");
            return;
          }
        }
      } catch {
        // Fall through to normal setup.
      }
      if (!cancelled) {
        setStage(kind === "oral" ? "oral-topics" : kind === "readiness" ? "setup" : "familiarity");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeEnabled, prepId, nodeId, kind]);

  useEffect(() => {
    if (kind !== "readiness" || stage !== "setup" || startInFlight.current) return;
    void start();
    // start her render'da yeni; yalnız hazırlık ekranı kuruluma düşünce bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, stage]);

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

  useEffect(() => {
    if (stage !== "play" || !isTimedExam || timeLeft > 0) return;
    toast.message("Süre doldu — cevapların gönderiliyor.");
    void finish();
    // finish her render'da yeni; yalnızca süre 0'a inince bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, stage, isTimedExam]);

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
    expiresAt?: string | null;
    timeLeftSec?: number;
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
    if (typeof data.timeLeftSec === "number") {
      setTimeLeft(data.timeLeftSec);
    } else if (data.expiresAt) {
      const end = new Date(data.expiresAt).getTime();
      if (!Number.isNaN(end)) {
        setTimeLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
      }
    }
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

  async function start(overrides?: {
    difficulty?: Difficulty;
    voiceMode?: boolean;
    mood?: Mood;
  }) {
    if (startInFlight.current || loading) return;
    startInFlight.current = true;
    setGenerationFailure(null);
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
          difficulty: overrides?.difficulty ?? difficulty,
          voiceMode: overrides?.voiceMode ?? voiceMode,
          familiarity,
          mood: overrides?.mood ?? mood,
          ...(isOral
            ? {
                oralQuestionCount: oralLength,
                oralScope: oralSelected.includes(ORAL_ALL_TOPICS) ? "all" : "topic",
                oralTopicLabel: (oralSelected.includes(ORAL_ALL_TOPICS)
                  ? (oralTopics.length ? oralTopics : [{ label: topicLabel || prepTitle }])
                      .map((topic) => topic.label)
                      .join(", ")
                  : oralTopics
                      .filter((topic) => oralSelected.includes(topic.id))
                      .map((topic) => topic.label)
                      .join(", ") || topicLabel || prepTitle
                ).slice(0, 400),
              }
            : {}),
          ...(requestedTopic ? { activityTopicLabel: requestedTopic.slice(0, 400) } : {}),
          ...(kind === "podcast" ? { podcastLength } : {}),
          ...(reqId ? { clientRequestId: reqId } : {}),
        }),
      });
      if (res.status === 402) {
        setPaywallReason("credit");
        setPaywall(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Kimlik HER gerçek hatada yenileniyor. Eskiden yalnızca
        // "generation_failed_retry" kodunda yenileniyordu; gerçek bir
        // hatadan (503) sonra ilk iki tıklama hiçbir şey yapmıyor,
        // üçüncüsü deniyordu. Öğrenci için bu "düğme bozuk" demekti.
        //
        // Üretim hâlâ sürüyorsa yenilenmiyor: yenilemek ikinci bir üretim
        // başlatır ve öğrenci iki kez ödeyebilir.
        const failure = describeGenerationFailure(
          generationFailureCode(data),
          resetsAtLabel ?? undefined,
          kind,
        );
        if (failure.retryMintsNewId) clearClientRequestId();
        setGenerationFailure(failure);
        setGenerationError(failure.message);
        return;
      }
      applyStartPayload(data);
      if (typeof data.balance === "number") {
        window.dispatchEvent(new CustomEvent("cortex-balance", { detail: data.balance }));
      }
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
      setScore({ score: data.score ?? 0, total: data.total ?? 1, retried: data.retried ?? 0 });
      if (data.review) setWrittenReview(data.review);
      if (data.oralReview) setOralReport(data.oralReview as OralExamReport);
      setNextHref(data.nextHref ?? `/deneme-sinavlari/${prepId}`);
      setFeedback(null);
      setStage(kind === "oral" ? "oral-review-time" : "result");
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

  async function loadLessonPodcast() {
    if (!topicId) return;
    setPodcastLoading(true);
    try {
      const res = await fetch("/api/learning/exam-prep/lesson-podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, topicId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setPaywallReason(data.code === "premium_required" ? "premium" : "credit");
        setPaywall(true);
        return;
      }
      if (!res.ok || !Array.isArray(data.chapters)) {
        toast.error("Sesli tekrar şu anda hazırlanamadı.");
        return;
      }
      setLessonPodcast({ title: data.title ?? topicLabel ?? "Sesli tekrar", chapters: data.chapters });
    } catch {
      toast.error("Sesli tekrar şu anda hazırlanamadı.");
    } finally {
      setPodcastLoading(false);
    }
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
        setPaywallReason("credit");
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
  const cinematicLesson =
    stage === "play" && payload.type === "lesson" && Boolean(structuredLesson);
  const cinematicPodcast =
    stage === "play" &&
    payload.type === "podcast" &&
    normalizeChapters(chapters).length > 0;
  const cinematicLoading = stage === "setup" && loading && kind !== "readiness";
  const oralRows: OralTopicRow[] = oralTopics.length
    ? oralTopics
    : topicLabel
      ? [{ id: "current", label: topicLabel, pct: 0 }]
      : [{ id: "current", label: prepTitle, pct: 0 }];
  const selectedOralLabels = oralRows
    .filter((topic) => oralSelected.includes(topic.id))
    .map((topic) => topic.label);
  const oralTopicLabel = selectedOralLabels.join(", ") || topicLabel || prepTitle;
  const oralVoiceLabel = oralVoiceTopicLabel(
    isOral ? selectedOralLabels : [topicLabel ?? prepTitle],
    topicLabel || prepTitle,
  );
  const oralReviewItems = oralReport?.items?.length
    ? oralReport.items.map((item) => oralReviewItemFromGrade(item))
    : payload.type === "oral"
      ? reviewItemsFromQuestions(questions, answers)
      : reviewItemsFromTranscript(oralTranscript);
  const oralPct =
    oralReport?.pct ??
    (payload.type === "oral"
      ? oralWrittenPercent(score.score, score.total)
      : oralVoicePercent(oralTranscript));
  const oralOwnsChrome =
    isOral && stage !== "restoring" && !(stage === "play" && payload.type === "oral");
  const showCoach =
    stage === "play" &&
    Boolean(coachItem) &&
    !isTimedExam &&
    payload.type !== "voice" &&
    payload.type !== "podcast" &&
    !cinematicLesson;

  return (
    <div className="cp-exam-page cp-exam-node">
      {pendingSaves > 0 ? <p role="status" className="text-sm">Cevapların kaydediliyor…</p> : null}
      {saveError ? <div role="alert" className="text-sm text-red-400">
        <p>{saveError}</p>
        <button type="button" className="underline" disabled={pendingSaves > 0}
          onClick={() => { void persistAnswers(answersRef.current, index).catch(() => undefined); }}>Kaydı yeniden dene</button>
      </div> : null}
      {cinematicLesson || cinematicLoading || cinematicPodcast || oralOwnsChrome ? null : (
      <div className="cp-exam-study-bar">
        <Link href={`/deneme-sinavlari/${prepId}`} className="cp-back-pill"
          onClick={(event) => { if (pendingSaves || saveError) { event.preventDefault(); toast.error("Çıkmadan önce cevapların kaydedilmesini bekle."); } }}>
          ← Geri
        </Link>
        {stage === "play" && isTimedExam ? (
          <span className={cn("cp-exam-timer", timeLeft < 120 && "cp-exam-timer--urgent")}>
            ⏱ {formatTimer(timeLeft)}
          </span>
        ) : null}
        <button type="button" className="cp-back-pill" disabled={pendingSaves > 0 || Boolean(saveError)} onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
          ×
        </button>
      </div>
      )}

      {stage === "restoring" ? (
        <section className="cp-exam-setup" aria-busy="true" aria-live="polite">
          <p className="cp-lesson-kicker">Devam</p>
          <h1>Kaldığın yer açılıyor…</h1>
          <p className="text-sm text-[var(--cp-muted)]">
            Kaydedilmiş cevapların yükleniyor. Yeniden ücret alınmaz — yarım kalan
            oturum güvenle sürer.
          </p>
          <p className="text-xs text-[var(--cp-muted)]" role="status">
            Bu ekran boş değil; kısa süre sonra sorulara döneceksin.
          </p>
        </section>
      ) : null}

      {stage === "familiarity" || stage === "mood" ? (
        <LessonOpenChrome
          step={stage}
          familiarity={familiarity}
          mood={mood}
          recommendedTitle={meta.setupLabel}
          topicLabel={topicLabel}
          onFamiliarity={(level) => {
            setFamiliarity(level);
            setDifficulty(difficultyFromFamiliarity(level));
            setStage("mood");
          }}
          onMood={(next) => {
            setMood(next);
            setStage(stepAfterMood(kind));
          }}
          onContinue={() => setStage("setup")}
          onCreate={() => void start()}
        />
      ) : null}

      {stage === "recommend" ? (
        <LessonOpenChrome
          step="recommend"
          recommendedTitle={meta.setupLabel}
          blurb={meta.blurb}
          topicLabel={topicLabel}
          onFamiliarity={() => undefined}
          onMood={() => undefined}
          onContinue={() => setStage("setup")}
          onCreate={() => void start()}
        />
      ) : null}

      {isOral && stage === "oral-topics" ? (
        <OralTopicPick
          topics={oralRows}
          selected={oralSelected}
          onToggle={(id) =>
            setOralSelected((current) => {
              if (id === ORAL_ALL_TOPICS) {
                return current.includes(ORAL_ALL_TOPICS) ? [] : [ORAL_ALL_TOPICS];
              }
              const rest = current.filter((item) => item !== ORAL_ALL_TOPICS);
              return rest.includes(id) ? rest.filter((item) => item !== id) : [...rest, id];
            })
          }
          onContinue={() => setStage("oral-customize")}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {isOral && stage === "oral-customize" && loading ? (
        <NodeGenerationProgress
          title="Sözlü deneme sınavı oluşturuluyor"
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {isOral && stage === "oral-customize" && !loading ? (
        <>
          <OralTeacherCustomize
            moodId={oralMoodId}
            onMood={setOralMoodId}
            length={oralLength}
            onLength={setOralLength}
            onBack={() => setStage("oral-topics")}
            onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
            onStart={() => setOralPreflight(true)}
            notice={generationError}
          />
          {oralPreflight ? (
            <OralPreflightDialog
              copy={{
                ...ORAL_PREFLIGHT,
                items: [
                  "Rahatça konuşabileceğin sessiz bir yer bul, ya da yazarak cevapla",
                  `${oralLength} soru bekle`,
                  "İstediğin zaman bitir, yine de geri bildirim alacaksın",
                  `${minutesForOralLength(oralLength)} dakika ile sınırlı`,
                ],
              }}
              onConfirm={() => {
                const choice = oralTeacherById(oralMoodId);
                setOralPreflight(false);
                setMood(choice.mood);
                setDifficulty(choice.difficulty);
                setVoiceMode(false);
                void start({
                  difficulty: choice.difficulty,
                  voiceMode: false,
                  mood: choice.mood,
                });
              }}
            />
          ) : null}
        </>
      ) : null}

      {stage === "setup" && loading && kind !== "readiness" ? (
        <NodeGenerationProgress
          sourceName={sourceName}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {stage === "setup" && loading && kind === "readiness" ? (
        <section className="cp-readiness" aria-busy="true">
          <h1>Hazırlık durumun hesaplanıyor</h1>
          <p>Kayıtlı ilerlemeden okunuyor. Yeni soru üretilmiyor.</p>
        </section>
      ) : null}

      {stage === "setup" && !loading && kind === "lesson" ? (
        <LessonOpenChrome
          step="create"
          recommendedTitle={meta.setupLabel}
          topicLabel={topicLabel}
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

      {stage === "setup" && !loading && kind !== "lesson" ? (
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
            <fieldset className="cp-pod-lengths">
              <legend>Süre</legend>
              {(
                [
                  ["ozet", "Özet · ~1 dk"],
                  ["standart", "Standart · ~5 dk"],
                  ["derin", "Derinlemesine · ~10 dk"],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="podcast-length"
                    checked={podcastLength === value}
                    onChange={() => setPodcastLength(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {meta.voice ? (
            <label className="cp-exam-voice-row">
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
          {generationFailure && !generationFailure.canRetryNow ? null : (
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              disabled={loading}
              onClick={() => void start()}
            >
              {loading ? "Hazırlanıyor…" : kind === "podcast" ? "Podcast oluştur" : "Ders oluştur"}
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

      {stage === "play" && payload.type === "voice" ? (
        <ExamVoiceTutor
          prepId={prepId}
          nodeId={nodeId}
          kind={kind === "oral" ? "oral" : "qa"}
          topicLabel={oralVoiceLabel}
          difficulty={difficulty}
          returnPath={`/deneme-sinavlari/${prepId}`}
          teacherStyle={isOral ? oralMoodId : undefined}
          submitting={loading}
          onFinish={(turns, transcript) => {
            if (transcript) setOralTranscript(transcript);
            void finish({ "0": turns > 0 ? "sesli yanıt" : "" });
          }}
        />
      ) : null}

      {stage === "play" && payload.type === "lesson" ? (
        structuredLesson ? (
          // Yapısal ders adım adım gelir: her bölüm kendi kontrolüyle
          // biter ve öğrenci cevaplamadan ilerleyemez.
          <ExamLessonSteps
            lesson={structuredLesson}
            language={language}
            onFinish={(missed) => {
              const indexes = (missed ?? []).filter((index) => Number.isInteger(index));
              void finish(indexes.length ? { lessonMisses: indexes } : undefined);
            }}
            onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
          />
        ) : (
          <section>
            <h1>{payload.title}</h1>
            <ExamLessonBody content={payload.contentMd ?? ""} />
            <button type="button" className="cp-exam-continue cp-exam-continue--primary" onClick={() => void finish()}>
              Bitir
            </button>
          </section>
        )
      ) : null}

      {stage === "play" && payload.type === "podcast" ? (
        <ExamPodcastPlayer
          title={payload.title ?? topicLabel ?? "Podcast"}
          chapters={chapters}
          finishing={loading}
          resumeKey={`${prepId}:${nodeId}:${payload.length ?? podcastLength}`}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
          onFinish={() => void finish()}
        />
      ) : null}

      {stage === "play" && payload.type === "quiz" && questions[index] ? (
        <div className="cp-written-review">
          {isTimedExam ? (
            <p className="cp-exam-silence">
              Yardım kapalı. Süre bitince cevapların gider. Açıklama sınav sonunda.
            </p>
          ) : payload.reused ? (
            <p className="cp-exam-silence">
              Kayıtlı sorulardan. Yeni üretim yok.
              {payload.uncoveredTopics?.length
                ? ` Şu konular için elde soru yok: ${payload.uncoveredTopics.join(", ")}.`
                : ""}
            </p>
          ) : null}
          <ExamQuizPlay
            questions={questions.map((question) => ({
              text: question.text ?? "",
              options: question.options ?? [],
              multi: Boolean(question.multi),
              correct: isTimedExam ? undefined : question.correct,
              explanation: isTimedExam ? undefined : question.explanation,
              optionWhy: isTimedExam ? undefined : question.optionWhy,
              misconceptionTag: isTimedExam ? undefined : question.misconceptionTag,
            }))}
            index={index}
            value={answers[String(index)]}
            onChange={(value) => updateAnswer(String(index), value)}
            onContinue={() => {
              if (index + 1 < questions.length) setIndex(index + 1);
              else void finish();
            }}
            continueLabel={
              index + 1 < questions.length
                ? "Sonraki soru"
                : isTimedExam
                  ? "Sınavı bitir"
                  : "Bitir"
            }
            disabled={loading}
            examMode={isTimedExam}
          />
        </div>
      ) : null}

      {stage === "play" && payload.type === "practice_empty" ? (
        <section className="cp-practice-empty">
          <p className="cp-lesson-kicker">{meta.setupLabel}</p>
          <h1>Kayıtlı soru yok</h1>
          <p>{payload.message}</p>
          <button type="button" className="cp-exam-continue" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
            Çalışma yoluna dön
          </button>
          <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} onClick={() => void finish()}>
            Bu adımı tamamla
          </button>
        </section>
      ) : null}

      {stage === "play" && payload.type === "readiness" && payload.screen ? (
        <ExamReadinessScreen
          screen={payload.screen}
          continuing={loading}
          onContinue={() => void finish()}
        />
      ) : null}

      {stage === "play" && payload.type === "true_false" && items[index] ? (
        <section>
          <p className="cp-lesson-kicker">
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
                    "cp-exam-continue",
                    isSelected && "cp-exam-continue--primary",
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
            <div className="cp-exam-quiz-feedback">
              <div
                className={cn(
                  "cp-exam-quiz-verdict",
                  answers[String(index)] === items[index].correct
                    ? "cp-exam-quiz-verdict--ok"
                    : "cp-exam-quiz-verdict--bad",
                )}
              >
                {answers[String(index)] === items[index].correct ? "✓ Doğru!" : "✕ Yanlış"}
              </div>
              {!items[index].correct && items[index].correctedStatement ? (
                <p className="cp-exam-quiz-explain"><strong>Doğru ifade:</strong> {items[index].correctedStatement}</p>
              ) : null}
              {items[index].explanation ? (
                <p className="cp-exam-quiz-explain">{items[index].explanation}</p>
              ) : null}
              <button
                type="button"
                className="cp-exam-continue cp-exam-continue--primary mt-2"
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
        <section className="cp-exam-card-stage">
          <p className="cp-lesson-kicker">
            {index + 1}/{cards.length}
          </p>
          <button type="button" className="cp-exam-flash" onClick={() => setFlipped((value) => !value)}>
            {flipped ? cards[index].back : cards[index].front}
          </button>
          <p className="text-sm text-[var(--cp-muted)]">Kartı çevirmek için tıkla</p>
          <p>Cevabı biliyor musun?</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="cp-exam-continue"
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
              className="cp-exam-continue cp-exam-continue--primary"
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
        <OralAnswerDesk
          index={index}
          total={questions.length}
          prompt={questions[index].prompt ?? ""}
          probeKind={(questions[index].probeKind as OralProbeKind | undefined) ?? "detail"}
          hint={oralMoodId === "helpful" ? questions[index].hint : null}
          persona={oralMoodId}
          minutes={minutesForOralLength(questions.length)}
          value={String(answers[String(index)] ?? "")}
          busy={loading}
          onChange={(text) => updateAnswer(String(index), text)}
          onAdvance={(answer) => {
            updateAnswer(String(index), answer);
            setIndex(index + 1);
          }}
          onFinish={(answer) => {
            const next = { ...answersRef.current, [String(index)]: answer };
            updateAnswer(String(index), answer);
            void finish(next);
          }}
        />
      ) : null}

      {stage === "oral-review-time" ? (
        <OralReviewTimeDialog onSeeResults={() => setStage("result")} />
      ) : null}

      {stage === "result" && isOral ? (
        <OralResults
          topicLabel={oralTopicLabel}
          pct={oralPct}
          onReview={() => {
            setOralReviewIndex(0);
            setOralReviewTab("ai");
            setStage("oral-review");
          }}
          strengths={oralReport?.strengths ?? []}
          weaknesses={oralReport?.weaknesses ?? []}
          practiceHref={oralReport?.nextStep?.href}
          practiceLabel={oralReport?.nextStep?.label}
          onRepeat={() => {
            setOralTranscript([]);
            setOralReport(null);
            setOralSelected([]);
            setIndex(0);
            setAnswers({});
            answersRef.current = {};
            setPayload({});
            setScore({ score: 0, total: 1, retried: 0 });
            setFeedback(null);
            setStage("oral-topics");
          }}
          nextHref={nextHref}
        />
      ) : null}

      {stage === "oral-review" ? (
        <OralAnswerReview
          items={
            oralReviewItems.length
              ? oralReviewItems
              : [
                  {
                    question: "Sözlü deneme sorusu sesli iletildi.",
                    answer: "",
                    solution: `Sesli yanıt kaydedilmedi. ${EMPTY_ORAL_ANSWER_NOTE}`,
                  },
                ]
          }
          index={oralReviewIndex}
          tab={oralReviewTab}
          onTab={setOralReviewTab}
          onIndex={setOralReviewIndex}
          onClose={() => setStage("result")}
        />
      ) : null}

      {stage === "result" && isTimedExam && writtenReview ? (
        <ExamWrittenReview
          review={writtenReview}
          nextHref={nextHref}
          onRetry={() => {
            setWrittenReview(null);
            setIndex(0);
            setAnswers({});
            answersRef.current = {};
            setPayload({});
            setScore({ score: 0, total: 1, retried: 0 });
            setStage("familiarity");
          }}
        />
      ) : null}

      {stage === "result" && payload.type === "readiness" && payload.screen ? (
        <ExamReadinessScreen screen={payload.screen} nextHref={nextHref} />
      ) : null}

      {stage === "result" && payload.type === "practice_empty" ? (
        <section className="cp-practice-empty">
          <h1>Bu adım kaydedildi</h1>
          <p>{payload.message}</p>
          <a href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            Devam et
          </a>
        </section>
      ) : null}

      {stage === "result" && !isOral && !isTimedExam && payload.type !== "readiness" && payload.type !== "practice_empty" ? (
        <section className="cp-exam-node-result">
          <p className="cp-lesson-kicker">Doğru cevaplar</p>
          <p className="cp-exam-score-xl">
            {score.score}/{score.total}
          </p>
          <p>{score.total && score.score / score.total >= 0.7 ? "Güzel gidiyor" : "Biraz daha gelişebilirsin"}</p>
          {score.retried > 0 ? (
            <p className="text-sm text-[var(--cp-muted)]">
              {score.retried === 1
                ? "1 soru ilk denemede yanlıştı. Tekrar ayrı durur ve bu sayıya eklenmez."
                : `${score.retried} soru ilk denemede yanlıştı. Tekrarlar ayrı durur ve bu sayıya eklenmez.`}
            </p>
          ) : null}
          <p className="text-sm text-[var(--cp-muted)]">
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
          <div className="cp-exam-node-actions">
            <button type="button" className="cp-exam-continue" onClick={() => {
              setStage("setup");
              setIndex(0);
              setAnswers({});
              setFeedback(null);
            }}>
              Dersi tekrarla
            </button>
            <button
              type="button"
              className="cp-exam-continue"
              disabled={feedbackLoading}
              onClick={() => void loadFeedback()}
            >
              {feedbackLoading ? "Yazıyor…" : "Eğitmeninden geri bildirim"}
            </button>
            {/* Sesli tekrar dersin devamı: aynı bölümler, aynı örnek,
                kulakla bir kez daha. Ders bitmeden önerilmiyor. */}
            {kind === "lesson" && topicId && !lessonPodcast ? (
              <button
                type="button"
                className="cp-exam-continue"
                disabled={podcastLoading}
                onClick={() => void loadLessonPodcast()}
              >
                {podcastLoading ? "Hazırlanıyor…" : "Şimdi dinle"}
              </button>
            ) : null}
          </div>
          {lessonPodcast ? (
            <ExamPodcastPlayer
              title={lessonPodcast.title}
              chapters={lessonPodcast.chapters}
              embed
              onClose={() => setLessonPodcast(null)}
              onFinish={() => setLessonPodcast(null)}
            />
          ) : null}
          {feedback ? (
            <article className="cp-exam-debrief">
              <p className="cp-lesson-kicker">Eğitmen notu</p>
              <h2>{feedback.headline}</h2>
              <p>{feedback.note}</p>
              {feedback.gaps.length ? (
                <>
                  <p className="cp-exam-debrief-label">Zayıf noktalar</p>
                  <ul>
                    {feedback.gaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {feedback.nextFocus.length ? (
                <>
                  <p className="cp-exam-debrief-label">Bundan sonra</p>
                  <ul>
                    {feedback.nextFocus.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ) : null}
          {payload.type === "lesson" ? (
            structuredLesson?.nextFocus?.length ? (
              <>
                <p className="cp-exam-debrief-label">Sıradaki adım</p>
                <ul>
                  {structuredLesson.nextFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-[var(--cp-muted)]">Sıradaki adım, hazırlığın bir sonraki çalışmasıdır.</p>
            )
          ) : null}
          <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
            {payload.type === "lesson" ? "Sıradaki adıma geç" : "Devam et"}
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
        message={
          paywallReason === "premium"
            ? "Sesli tekrar için hakkın yetmedi."
            : "Bu ders için kredin kalmadı."
        }
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
