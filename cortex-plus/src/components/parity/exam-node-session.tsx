"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Star, Swords } from "lucide-react";
import { toast } from "sonner";
import { createSerialTaskQueue } from "@/lib/learning/serial-task-queue";
import {
  describeGenerationFailure,
  generationFailureCode,
  type GenerationFailure,
} from "@/lib/learning/generation-failure";
import { useIsFounder, useStudentShellAccount } from "@/lib/student/student-shell-context";
import { creditGateCopy } from "@/lib/billing/free-reach";
import { ExamFinishButton } from "@/components/parity/exam-finish-button";
import { STARS_CHANGED_EVENT } from "@/components/parity/stars-dialog";
import { ExamNodeCoach } from "@/components/parity/exam-node-coach";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import {
  type GradeCheckResult,
  type LessonCheckAnswer,
} from "@/lib/learning/lesson-play";
import { readPlayLessonV3 } from "@/lib/learning/lesson-play-v3";
import { ExamPodcastPlayer } from "@/components/parity/exam-podcast-player";
// Üretim düşünce ekran bir kez kendiliğinden yeniden dener (19 Ekim 2026); kurallar tek yerde.
import {
  AUTO_RETRY_CODES,
  AUTO_RETRY_DELAY_MS,
  BUSY_CODE,
  BUSY_MAX_RETRIES,
  BUSY_NOTE,
  BUSY_RETRY_DELAY_MS,
} from "@/lib/learning/generation-retry";
import { TopicGainCard, topicGainWorthShowing, type TopicGain } from "@/components/parity/topic-gain-card";
import { parsePathChange, pathChangeLine, type PathChange } from "@/lib/learning/path-change";
import { unscoredResult } from "@/lib/learning/node-result";
import { PodcastListeningCheck } from "@/components/parity/podcast-listening-check";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";
import { reviewScheduledLine } from "@/lib/learning/review-copy";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { RichBody } from "@/components/parity/lesson-rich-text";
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
import { resultMood } from "@/lib/learning/result-mood";
import { LessonRatingCard } from "@/components/parity/lesson-rating-card";
import { LevelSuggestCard } from "@/components/parity/level-suggest-card";
import type { LevelHint } from "@/lib/learning/prep-level";
import { onGenerationSucceeded } from "@/lib/credits/spendable";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";
import {
  difficultyFromFamiliarity,
  openingStage,
  stepAfterMood,
} from "@/lib/learning/lesson-open";
import "@/styles/node-generation-progress.css";
import { useLearningTimer } from "@/components/learning/use-learning-timer";
import type { LearningSurface } from "@/lib/learning/learning-time";
import { knownCardCount, missedCards, repeatedCardsLine } from "@/lib/learning/flashcard-round";
import { NodeSources, type NodeSource } from "@/components/parity/node-sources";
import { PodcastFormatPicker } from "@/components/parity/podcast-format-picker";
import { DEFAULT_PODCAST_LENGTH, type PodcastLength } from "@/lib/learning/podcast-formats";

/** Aktif süre hangi başlıkta sayılır: ders, test ya da sınav. */
function learningSurface(kind: PlanNodeKind): LearningSurface {
  if (kind === "lesson" || kind === "podcast" || kind === "flashcards") return "lesson";
  if (kind === "written_exam" || kind === "oral" || kind === "readiness") return "exam";
  return "quiz";
}

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
  /** Podcast'in dinleme kontrolü (20 Ekim 2026); yoksa podcast kontrolsüz biter. */
  check?: PublicQuizQuestion[];
  questions?: {
    text?: string;
    prompt?: string;
    options?: string[];
    multi?: boolean;
    correct?: string[];
    explanation?: string;
    optionWhy?: string[];
    steps?: string[];
    misconceptionTag?: string;
    hint?: string;
    expectedPoints?: string[];
    probeKind?: OralProbeKind;
  }[];
  items?: { text: string; correct: boolean; explanation: string; correctedStatement?: string }[];
  cards?: { front: string; back: string }[];
  practice?: string;
  reused?: boolean;
  /** Kilitli araç (Bilgi boşlukları, Tekrar): tamamla düğmesi yok. */
  locked?: boolean;
  /** Senaryo üretiminde düşen kredi. Önbellek 0, yeni senaryo fiyat tablosundaki değer. */
  scriptCredits?: number;
  uncoveredTopics?: string[];
  message?: string;
  screen?: ReadinessScreen;
  /** Parça parça açılan ders: sonraki kavramlar yazılıyor (18 Ekim 2026). */
  building?: boolean;
  /** Henüz gelmemiş kavramların adları (giriş kartı planı). */
  upcoming?: string[];
};

/** Yazım sürerken ekranın yeni kavramları sorma aralığı. */
const LESSON_PROGRESS_POLL_MS = 1_500;

export function ExamNodeSession({
  prepId,
  nodeId,
  kind,
  prepTitle,
  topicLabel,
  requestedTopic = null,
  topicId = null,
  initialFamiliarity,
  todayMood = null,
  replayLesson = false,
  resumeEnabled = false,
  openAttempt = true,
  sourceName = null,
  resetsAtLabel = null,
  oralTopics = [],
  language = "tr",
  subject = null,
  sources = [],
  unitTitle = null,
}: {
  /** Kavram birimli derste dersin kendi adı; kurulum ekranları bunu gösterir. */
  unitTitle?: string | null;
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
  /** Bugün (Türkiye günü) verilmiş ruh hali; varsa kart sorulmaz (19 Ekim 2026). */
  todayMood?: Mood | null;
  /** Sonuç sayfasından "Dersi tekrarla" (?tekrar=1): aynı ders yeniden açılır. */
  replayLesson?: boolean;
  /** Stage 8 — pdf_learning_v2: restore attempt + debounce + save answers. */
  resumeEnabled?: boolean;
  /**
   * Sunucu bu düğümde açık oturum (ya da yazılı denemede inceleme) olabileceğini söylüyor. Değilse
   * "kaldığın yer" sorgusu ve ekranı atlanır: 20 Ekim 2026'da hiç açılmamış derste her açılışta
   * ~5 sn "Kaldığın yer açılıyor… Kaydedilmiş cevapların yükleniyor" yazıyordu.
   */
  openAttempt?: boolean;
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
  /** Hazırlığın dersi ("Matematik"); Aktivitelerim'deki en sevilen dersler. */
  subject?: string | null;
  /** Hazırlığın materyalleri — çalışma ekranında "N kaynak". */
  sources?: NodeSource[];
}) {
  const router = useRouter();
  const isAdmin = useIsFounder();
  // Kredi kapısının cümlesi: ücretsiz hakkı aşan işte (podcast, sözlü) "doldu" denmez (free-reach.ts).
  const shellAccount = useStudentShellAccount();
  const gateCopy = creditGateCopy(kind, shellAccount?.isPremium ?? false);
  const meta = PLAN_NODE_META[kind];
  // Referans üründeki sıra: aşinalık → ruh hali → kurulum. İkisi de zorunlu değil;
  // "setup"tan geri dönülebilsin diye aynı stage makinesinde tutuluyorlar.
  const isOral = kind === "oral";
  const opensReadiness = kind === "readiness";
  // Aşinalık kurulumda bir kez sorulur (18 Ekim 2026); konunun düzeyi biliniyorsa açılış
  // doğrudan ruh haline geçer. Önceden yazılan içerik bu düzeyle yazıldı.
  // Ruh hali günde bir kez (19 Ekim 2026): bugün verildiyse kart atlanır.
  const signalStage = openingStage(kind, { familiarityKnown: Boolean(initialFamiliarity), moodToday: Boolean(todayMood) });
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
  >(resumeEnabled && openAttempt ? "restoring" : opensReadiness ? "setup" : isOral ? "oral-topics" : signalStage);
  const [familiarity, setFamiliarity] = useState<Familiarity>(
    initialFamiliarity ?? DEFAULT_FAMILIARITY,
  );
  const [mood, setMood] = useState<Mood>(todayMood ?? DEFAULT_MOOD);
  // Yalnızca çalışırken sayılır; kurulum ve sonuç ekranı değil.
  useLearningTimer(
    learningSurface(kind),
    subject,
    stage === "play" || stage === "oral-review",
  );
  // Aşinalık kurulumdan geldiyse zorluk da ondan başlar; önceden yazılan test bu zorlukla yazıldı.
  const [difficulty, setDifficulty] = useState<Difficulty>(
    initialFamiliarity ? difficultyFromFamiliarity(initialFamiliarity) : "orta",
  );
  const [podcastLength, setPodcastLength] = useState<PodcastLength>(DEFAULT_PODCAST_LENGTH);
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
  /** Üretim yuvaları dolu: hazırlanıyor ekranında "sıradasın" notu (19 Ekim 2026, Faz 3.2). */
  const [queueNote, setQueueNote] = useState(false);
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
  /** Cevabı en az bir kez görülen kartın sırası — değerlendirme ancak ondan sonra açılır. */
  const [revealedCard, setRevealedCard] = useState(-1);
  /** İlk turun sonunda "Hayır" denen kartlar: tekrar turu teklifi. */
  const [cardOffer, setCardOffer] = useState<number[] | null>(null);
  /** Tekrar turu: sıradaki kartlar, konum ve bu turda bilinenler. */
  const [cardRepeat, setCardRepeat] = useState<{ list: number[]; pos: number; known: number[] } | null>(null);
  /** Kart sonucu "Bildiğin kartlar N/M" — kayıttaki puan katılım puanı. */
  const [cardSummary, setCardSummary] = useState<{ known: number; total: number; repeated: number } | null>(null);
  const [score, setScore] = useState({ score: 0, total: 1, retried: 0 });
  /** Bu etkinlikle kazanılan yıldız (Astra: sonuç ekranında "+17 yıldız"). */
  const [starsEarned, setStarsEarned] = useState(0);
  const [playStartedAt, setPlayStartedAt] = useState<number | null>(null);
  const [oralGrade, setOralGrade] = useState<{
    items: { index: number; correct: boolean; gap: string | null }[];
    scoreRationale?: string;
  } | null>(null);
  const [writtenReview, setWrittenReview] = useState<WrittenExamReview | null>(null);
  const [nextHref, setNextHref] = useState(`/deneme-sinavlari/${prepId}`);
  /** Astra'nın sonuç sonrası düzey önerisi; bitirişte sunucu söyler. */
  const [levelHint, setLevelHint] = useState<LevelHint | null>(null);
  /** Sonuçtan sonra "+%X kazandın" (19 Ekim 2026); yalnız konu hâkimiyeti arttıysa. */
  const [topicGain, setTopicGain] = useState<TopicGain | null>(null);
  /** Sonuca göre yol (20 Ekim 2026): araya giren odaklı pratik ya da kalkan ek testler. */
  const [pathChange, setPathChange] = useState<PathChange | null>(null);
  /** Günü gelen tekrar (20 Ekim 2026): bu etkinlikten yarına yazılan yanlış sayısı. */
  const [reviewScheduled, setReviewScheduled] = useState(0);
  const [gainOpen, setGainOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    headline: string;
    note: string;
    gaps: string[];
    nextFocus: string[];
  } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [tfRevealed, setTfRevealed] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(false);
  /** Podcast bitti, dinleme kontrolü açık (aşama yine "play": süre sayılmaya devam eder). */
  const [podcastCheckOpen, setPodcastCheckOpen] = useState(false);
  const [lessonPodcast, setLessonPodcast] = useState<{
    title: string;
    chapters: unknown[];
  } | null>(null);
  /**
   * Stage 6: cevaplanmadan önce eğitmenden yardım alınan sorular. 20 Ekim 2026'ya kadar her
   * çizimde boş bir nesneydi ve hiç doldurulmuyordu: eğitmenle çözülen soru bağımsız doğru
   * sayılıyordu. Yalnız bellekte; sayfa yenilenirse kaybolur (eski davranış).
   */
  const hintsUsedRef = useRef<Record<string, boolean>>({});
  /** Testte "Kontrol et" ile kilitlenen sorular: sonrasındaki eğitmen açıklaması ipucu değil. */
  const revealedRef = useRef<Set<string>>(new Set());
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

  // Yeni deneme, yeni ipucu kaydı.
  useEffect(() => {
    hintsUsedRef.current = {};
    revealedRef.current = new Set();
  }, [attemptId]);

  useEffect(() => {
    if (!resumeEnabled) return;
    let cancelled = false;
    (async () => {
      if (!openAttempt) {
        // Açık oturum yok: doğrudan açılış (tekrar isteği de burada başlar).
        if (kind === "lesson" && replayLesson) {
          setStage("setup");
          void start({ replay: true });
        }
        return;
      }
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, action: "resume", lessonFormat: 3 }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.resumed && data.attemptId && data.payload) {
          applyStartPayload(data);
          setPlayStartedAt(Date.now());
          setStage("play");
          return;
        }
        if (kind === "written_exam") {
          const reviewRes = await fetch("/api/learning/exam-prep/node", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prepId, nodeId, action: "review", lessonFormat: 3 }),
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
        if (kind === "lesson" && replayLesson) {
          // Sonuç sayfasından "Dersi tekrarla": soru kartları olmadan aynı ders.
          setStage("setup");
          void start({ replay: true });
        } else {
          setStage(kind === "oral" ? "oral-topics" : kind === "readiness" ? "setup" : signalStage);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // start her render'da yeni; yalnız açılışta, kayıtlı oturum yoksa bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeEnabled, openAttempt, prepId, nodeId, kind, signalStage, replayLesson]);

  // Isınma (19 Ekim 2026): ders düğümü açılıp ruh hali / aşinalık ekranı görününce yazım sunucuda
  // hemen başlar; öğrenci kartlara bakarken ilk kavram hazırlanır, "Ders oluştur" devralır.
  // Bir kez; "Dersi tekrarla" hariç (o yazdırmaz). Sunucu süren kayıt ya da hazır ders varsa atlar.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (kind !== "lesson" || replayLesson || warmedRef.current) return;
    // Ruh hali bugün verildiyse açılış doğrudan öneri kartıdır; ısınma orada da başlar.
    if (stage !== "familiarity" && stage !== "mood" && stage !== "recommend") return;
    warmedRef.current = true;
    void fetch("/api/learning/exam-prep/node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, nodeId, action: "warm", familiarity, lessonFormat: 3 }),
    }).catch(() => undefined);
  }, [kind, replayLesson, stage, prepId, nodeId, familiarity]);

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
    /** "Dersi tekrarla": son ders yeniden açılır, yeniden yazılmaz. */
    replay?: boolean;
    /** Sunucu düşünce ekranın kendi kendine yaptığı ikinci deneme (bir kez). */
    autoRetried?: boolean;
    /** Üretim yuvaları doluyken ("sıradasın") yapılan bekleme denemelerinin sayısı. */
    busyTries?: number;
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
          // Bu ekran LessonV3 (ekran → blok) okuyor; eski sekme göndermez, V2 alır.
          lessonFormat: 3,
          // Ders parça parça açılır: ilk denetlenmiş kavram gelince ekran açılır (18 Ekim 2026).
          ...(kind === "lesson" ? { lessonStream: true } : {}),
          ...(kind === "lesson" && overrides?.replay ? { replay: true } : {}),
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
        const code = generationFailureCode(data);
        // Yuvalar dolu (Faz 3.2): hata değil, sıra. Hazırlanıyor ekranı açık kalır, birkaç saniyede bir
        // yeniden sorulur; sunucu her denemede yer açılmasını ayrıca bekliyor.
        if (code === BUSY_CODE && (overrides?.busyTries ?? 0) < BUSY_MAX_RETRIES) {
          setQueueNote(true);
          await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
          startInFlight.current = false;
          await start({ ...overrides, busyTries: (overrides?.busyTries ?? 0) + 1 });
          return;
        }
        setQueueNote(false);
        // 19 Ekim 2026 (ürün sahibi: "oluşturulamadı gibi uyarılar olmasın"): üretim düşünce
        // ekran bir kez kendiliğinden yeniden dener; hazırlanıyor ekranı kapanmaz. Hak, paket
        // ve kaynak hataları yeniden denemekle geçmez, onlar hemen söylenir.
        if (typeof code === "string" && AUTO_RETRY_CODES.has(code) && !overrides?.autoRetried) {
          clearClientRequestId();
          await new Promise((resolve) => setTimeout(resolve, AUTO_RETRY_DELAY_MS));
          startInFlight.current = false;
          await start({ ...overrides, autoRetried: true });
          return;
        }
        const failure = describeGenerationFailure(
          code,
          resetsAtLabel ?? undefined,
          kind,
          {
            isAdmin,
            refunded: data.refunded === true,
            reason: typeof data.reason === "string" ? data.reason : undefined,
          },
        );
        if (failure.retryMintsNewId) clearClientRequestId();
        setGenerationFailure(failure);
        setGenerationError(failure.message);
        return;
      }
      setQueueNote(false);
      applyStartPayload(data);
      if (typeof data.balance === "number") {
        window.dispatchEvent(new CustomEvent("cortex-balance", { detail: data.balance }));
      }
      setPlayStartedAt(Date.now());
      setStage("play");
      onGenerationSucceeded(() => router.refresh());
    } catch {
      // Bağlantı ders yazılırken koptuysa sunucu çoğu zaman yazmayı bitiriyor
      // (16 Ekim 2026: hata çıktı, sayfa yenilenince ders oradaydı). Önce bir kez bak.
      if (resumeEnabled && (await resumeAfterLostStart())) return;
      setGenerationError("Bağlantı kurulamadı. Lütfen yeniden dene.");
    } finally {
      setLoading(false);
      startInFlight.current = false;
    }
  }

  async function resumeAfterLostStart(): Promise<boolean> {
    try {
      const res = await fetch("/api/learning/exam-prep/node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepId, nodeId, action: "resume", lessonFormat: 3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.resumed || !data.attemptId || !data.payload) return false;
      applyStartPayload(data);
      setPlayStartedAt(Date.now());
      setStage("play");
      return true;
    } catch {
      return false;
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
          lessonFormat: 3,
          attemptId: attemptId ?? undefined,
          generationId: generationId ?? undefined,
          clientRequestId: clientRequestId ?? undefined,
          completeRequestId: resumeEnabled
            ? completeRequestIdRef.current
            : undefined,
          answers: {
            ...base,
            __meta: { hintsUsed: hintsUsedRef.current },
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
      const earned = Number(data.stars) || 0;
      setStarsEarned(earned);
      if (earned > 0) window.dispatchEvent(new Event(STARS_CHANGED_EVENT));
      setOralGrade(
        data.oralGrade && Array.isArray(data.oralGrade.items)
          ? {
              items: data.oralGrade.items,
              scoreRationale: data.oralGrade.scoreRationale,
            }
          : null,
      );
      if (data.review) setWrittenReview(data.review);
      if (data.oralReview) setOralReport(data.oralReview as OralExamReport);
      setNextHref(data.nextHref ?? `/deneme-sinavlari/${prepId}`);
      setLevelHint(data.levelHint === "too_hard" || data.levelHint === "too_easy" ? data.levelHint : null);
      setTopicGain(topicGainWorthShowing(data.topicGain) ? data.topicGain : null);
      setPathChange(parsePathChange(data.pathChange));
      setReviewScheduled(Number(data.reviewScheduled) || 0);
      setGainOpen(false);
      setFeedback(null);
      setStage(kind === "oral" ? "oral-review-time" : "result");
      router.refresh();
      if (typeof data.balance === "number") {
        window.dispatchEvent(new CustomEvent("cortex-balance", { detail: data.balance }));
      }
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

  function finishCards(base: Record<string, unknown>, recovered: number[]) {
    setCardSummary({
      known: knownCardCount(base, cards.length, recovered),
      total: cards.length,
      repeated: missedCards(base, cards.length).length,
    });
    void finish(base);
  }

  /**
   * Kartı değerlendir. İlk turun sonunda "Hayır" denen kart varsa tekrar
   * turu teklif edilir; tekrar turundaki cevap kayda yazılmaz.
   */
  function rateCard(known: boolean) {
    setFlipped(false);
    setRevealedCard(-1);
    if (cardRepeat) {
      const current = cardRepeat.list[cardRepeat.pos];
      const recovered = known ? [...cardRepeat.known, current] : cardRepeat.known;
      if (cardRepeat.pos + 1 < cardRepeat.list.length) {
        setCardRepeat({ ...cardRepeat, pos: cardRepeat.pos + 1, known: recovered });
      } else {
        setCardRepeat({ ...cardRepeat, known: recovered });
        finishCards(answersRef.current, recovered);
      }
      return;
    }
    const nextAnswers = { ...answersRef.current, [String(index)]: known };
    updateAnswer(String(index), known);
    if (index + 1 < cards.length) {
      setIndex(index + 1);
      return;
    }
    const missed = missedCards(nextAnswers, cards.length);
    if (missed.length) setCardOffer(missed);
    else finishCards(nextAnswers, []);
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
        toast.error("Sesli tekrar bu sefer tamamlanamadı; yeniden dene.");
        return;
      }
      setLessonPodcast({ title: data.title ?? topicLabel ?? "Sesli tekrar", chapters: data.chapters });
    } catch {
      toast.error("Sesli tekrar bu sefer tamamlanamadı; yeniden dene.");
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
  const structuredLesson = useMemo(() => (payload.lesson ? readPlayLessonV3(payload.lesson) : null), [payload.lesson]);
  /** Baştan yazıma rağmen hazırlanamayan kavramlar (sunucu `missingConcepts`). */
  const missingConcepts = useMemo(() => {
    const raw = (payload as { missingConcepts?: unknown }).missingConcepts;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  }, [payload]);
  const lessonBuilding = payload.type === "lesson" && payload.building === true;

  // Parça parça açılan ders: yazım sürerken yeni kavramlar kayıttan okunur. Öğrenci ilk
  // kavramı okurken sonrakiler denetlenip eklenir; bitince bayrak kalkar.
  useEffect(() => {
    if (!lessonBuilding || !attemptId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Değişmeyen cevapla ekran yeniden çizilmesin.
    let last = "";
    const poll = async () => {
      try {
        const res = await fetch("/api/learning/exam-prep/node", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId, nodeId, attemptId, action: "progress", lessonFormat: 3 }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; payload?: Payload };
        if (!stopped && res.ok && data.payload) {
          const seen = JSON.stringify(data.payload);
          if (seen !== last) {
            last = seen;
            setPayload(data.payload);
          }
          if (data.payload.building !== true) return;
        }
      } catch {
        // Bağlantı anlık koptu: bir sonraki turda yeniden sorulur.
      }
      if (!stopped) timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    };
    timer = setTimeout(poll, LESSON_PROGRESS_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [lessonBuilding, attemptId, prepId, nodeId]);
  const cardIndex = cardRepeat ? (cardRepeat.list[cardRepeat.pos] ?? index) : index;
  const cardsPlaying = stage === "play" && payload.type === "cards" && !cardOffer;
  const coachItem =
    payload.type === "quiz"
      ? questions[index]?.text
      : payload.type === "true_false"
        ? items[index]?.text
        : payload.type === "cards"
          ? cards[cardIndex]?.front
          : payload.type === "oral"
            ? questions[index]?.prompt
            : payload.type === "lesson"
              ? payload.title
              : null;
  const cinematicLesson =
    stage === "play" && payload.type === "lesson" && Boolean(structuredLesson);
  const podcastCheck =
    payload.type === "podcast" && Array.isArray(payload.check)
      ? payload.check.filter((question) => typeof question?.text === "string" && Array.isArray(question.options))
      : [];
  // Dinleme kontrolü testteki gibi oturum çubuğuyla (tek çıkış ×) açılır; oynatıcı kendi çıkışını taşır.
  const cinematicPodcast =
    stage === "play" &&
    payload.type === "podcast" &&
    !podcastCheckOpen &&
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
  // Boşluk tuşu kartı çevirir (Astra). Odak bir düğmedeyse tarayıcı zaten
  // o düğmeye basıyor; ikinci kez çevirmeyelim.
  useEffect(() => {
    if (!cardsPlaying) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setFlipped((value) => !value);
      setRevealedCard(cardIndex);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cardsPlaying, cardIndex]);

  // Podcast puanlanmaz (19 Ekim 2026, canlı): soru yokken sonuç "Doğru cevaplar 1/1 · Doğruluk %100"
  // diyordu. Dinleme kontrolü cevaplandıysa (20 Ekim 2026) "2/3" gösterilir; atlandıysa yine puansız.
  // Sonuç sayfasıyla aynı kural (`unscoredResult`).
  const unscored = unscoredResult(kind, score.total);
  const heroScore = payload.type === "cards" && cardSummary ? cardSummary.known : score.score;
  const heroTotal = payload.type === "cards" && cardSummary ? cardSummary.total : score.total;
  const showCoach =
    stage === "play" &&
    Boolean(coachItem) &&
    !isTimedExam &&
    payload.type !== "voice" &&
    payload.type !== "podcast" &&
    !cinematicLesson;

  /**
   * Eğitmen cevap verdi: soru henüz kilitlenmediyse bu soru ipuçlu sayılır (20 Ekim 2026). Testte
   * kilit "Kontrol et", doğru/yanlışta seçim; sözlüde cevap ilerleyince sonraki soruya geçilir.
   * Cevaptan sonraki açıklama ipucu değil.
   */
  function markHint() {
    if (payload.type !== "quiz" && payload.type !== "true_false" && payload.type !== "oral") return;
    const key = String(index);
    const locked =
      payload.type === "quiz"
        ? revealedRef.current.has(key)
        : payload.type === "true_false"
          ? answersRef.current[key] !== undefined
          : false;
    if (locked) return;
    hintsUsedRef.current = { ...hintsUsedRef.current, [key]: true };
  }

  return (
    <div className="cp-exam-page cp-exam-node">
      {pendingSaves > 0 ? <p role="status" className="text-sm">Cevapların kaydediliyor…</p> : null}
      {saveError ? <div role="alert" className="text-sm text-red-400">
        <p>{saveError}</p>
        <button type="button" className="underline" disabled={pendingSaves > 0}
          onClick={() => { void persistAnswers(answersRef.current, index).catch(() => undefined); }}>Kaydı yeniden dene</button>
      </div> : null}
      {cinematicLesson || cinematicLoading || cinematicPodcast || oralOwnsChrome ? null : (
      // Astra'da oturumda tek çıkış sağ üstteki × (3 Ekim 2026); üst çubuk da yok.
      <div className="cp-exam-study-bar">
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
        <section className="cp-exam-setup cp-exam-restoring" aria-busy="true" aria-live="polite">
          <span className="cp-exam-restoring-spin" aria-hidden />
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

      {stage === "recommend" ? (
        <LessonOpenChrome
          step="recommend"
          recommendedTitle={meta.setupLabel}
          blurb={meta.blurb}
          topicLabel={unitTitle ?? topicLabel}
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
              questionCount={oralLength}
              minutes={minutesForOralLength(oralLength)}
              onCancel={() => setOralPreflight(false)}
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
          note={queueNote ? BUSY_NOTE : undefined}
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
            <PodcastFormatPicker value={podcastLength} onChange={setPodcastLength} />
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
              {loading
                ? "Hazırlanıyor…"
                : kind === "podcast"
                  ? "Podcast oluştur"
                  : kind === "flashcards"
                    ? "Kartları oluştur"
                    : kind === "written_exam"
                      ? "Denemeyi oluştur"
                      : "Testi oluştur"}
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
            building={lessonBuilding}
            upcoming={lessonBuilding ? (payload.upcoming ?? []) : []}
            language={language}
            gradeCheck={
              attemptId
                ? async (sectionIndex, answer, variant = "primary") => {
                    const res = await fetch("/api/learning/exam-prep/node", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        prepId,
                        nodeId,
                        attemptId,
                        action: "grade-check",
                        sectionIndex,
                        variant,
                        checkAnswer: answer,
                      }),
                    });
                    const data = (await res.json().catch(() => ({}))) as GradeCheckResult & {
                      ok?: boolean;
                      error?: string;
                    };
                    if (!res.ok) {
                      throw new Error(data.error ?? "grade_failed");
                    }
                    return data;
                  }
                : undefined
            }
            onFinish={(missed, lessonAnswers, retryAnswers) => {
              const indexes = (missed ?? []).filter((index) => Number.isInteger(index));
              const payloadAnswers: Record<string, unknown> = {};
              if (indexes.length) payloadAnswers.lessonMisses = indexes;
              if (lessonAnswers && Object.keys(lessonAnswers).length) {
                payloadAnswers.lessonAnswers = lessonAnswers as Record<string, LessonCheckAnswer>;
              }
              if (retryAnswers && Object.keys(retryAnswers).length) {
                payloadAnswers.retryAnswers = retryAnswers as Record<string, LessonCheckAnswer>;
              }
              void finish(Object.keys(payloadAnswers).length ? payloadAnswers : undefined);
            }}
            onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
            toolbar={sources.length ? <NodeSources sources={sources} /> : null}
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
          // Kontrol varsa önce üç soru (atlanabilir), sonra tamamlama (20 Ekim 2026).
          onFinish={() => (podcastCheck.length ? setPodcastCheckOpen(true) : void finish())}
        />
      ) : null}

      {stage === "play" && payload.type === "quiz" && questions[index] ? (
        <div className="cp-written-review">
          {!isTimedExam ? <NodeSources sources={sources} /> : null}
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
              steps: isTimedExam ? undefined : question.steps,
              misconceptionTag: isTimedExam ? undefined : question.misconceptionTag,
            }))}
            index={index}
            value={answers[String(index)]}
            onChange={(value) => updateAnswer(String(index), value)}
            onReveal={() => revealedRef.current.add(String(index))}
            onContinue={() => {
              if (index + 1 < questions.length) setIndex(index + 1);
              else void finish();
            }}
            continueLabel={
              index + 1 < questions.length
                ? "Sonraki soru"
                : isTimedExam
                  ? "Sınavı bitir"
                  : "Testi bitir"
            }
            disabled={loading}
            examMode={isTimedExam}
          />
        </div>
      ) : null}

      {stage === "play" && payload.type === "practice_empty" ? (
        <section className="cp-practice-empty">
          <p className="cp-lesson-kicker">{meta.setupLabel}</p>
          <h1>{payload.locked ? "🔒 Henüz kilitli" : "Kayıtlı soru yok"}</h1>
          <p>{payload.message}</p>
          <button type="button" className="cp-exam-continue" onClick={() => router.push(`/deneme-sinavlari/${prepId}`)}>
            Çalışma yoluna dön
          </button>
          {payload.locked ? null : (
            <button type="button" className="cp-exam-continue cp-exam-continue--primary" disabled={loading} onClick={() => void finish()}>
              Bu adımı tamamla
            </button>
          )}
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
          <h1>
            <RichBody text={items[index].text} />
          </h1>
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
                <p className="cp-exam-quiz-explain">
                  <strong>Doğru ifade:</strong> <RichBody text={items[index].correctedStatement} />
                </p>
              ) : null}
              {items[index].explanation ? (
                <p className="cp-exam-quiz-explain">
                  <RichBody text={items[index].explanation} />
                </p>
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

      {stage === "play" && payload.type === "cards" && cardOffer ? (
        <section className="cp-exam-card-offer" aria-labelledby="card-offer-title">
          <p className="cp-exam-card-offer-emoji" aria-hidden>
            🔁
          </p>
          <h2 id="card-offer-title">Bilmediğin kartlara bir kez daha bakalım</h2>
          <p>
            Tekrarlanacak kartlar: <strong>{cardOffer.length}</strong>
          </p>
          <div className="cp-exam-card-rate">
            <button
              type="button"
              className="cp-exam-continue"
              disabled={loading}
              onClick={() => finishCards(answersRef.current, [])}
            >
              Atla
            </button>
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              disabled={loading}
              onClick={() => {
                setCardRepeat({ list: cardOffer, pos: 0, known: [] });
                setCardOffer(null);
                setFlipped(false);
                setRevealedCard(-1);
              }}
            >
              Devam et
            </button>
          </div>
        </section>
      ) : null}

      {cardsPlaying && cards[cardIndex] ? (
        /*
          Değerlendirme cevap görüldükten sonra açılıyor. Önceden "Evet"
          kart hiç çevrilmeden basılabiliyordu: öğrenci cevabı görmeden
          "biliyorum" diyebiliyor, o öz-değerlendirme de kayda geçiyordu.
          Aralıklı tekrarın kuralı önce hatırla, sonra cevabı gör, sonra
          dürüstçe değerlendir.
        */
        <section className="cp-exam-card-stage">
          <CardProgress
            label={cardRepeat ? "Tekrar" : null}
            position={cardRepeat ? cardRepeat.pos + 1 : index + 1}
            total={cardRepeat ? cardRepeat.list.length : cards.length}
          />
          <NodeSources sources={sources} />
          <button
            type="button"
            className={cn("cp-exam-flash", flipped && "cp-exam-flash--back")}
            aria-label={flipped ? "Kartı soru yüzüne çevir" : "Kartı çevir, cevabı göster"}
            onClick={() => {
              setFlipped((value) => !value);
              setRevealedCard(cardIndex);
            }}
          >
            <span className="cp-exam-flash-side">{flipped ? "Cevap" : "Soru"}</span>
            <span aria-live="polite">
              <RichBody text={flipped ? cards[cardIndex].back : cards[cardIndex].front} />
            </span>
          </button>
          {revealedCard !== cardIndex ? (
            <p className="cp-exam-card-hint">
              Önce kendin hatırlamaya çalış, sonra karta dokun ya da boşluk tuşuna bas.
            </p>
          ) : null}
          {revealedCard === cardIndex ? (
          <>
          <p>Cevabı biliyor muydun?</p>
          <div className="cp-exam-card-rate">
            <button
              type="button"
              className="cp-exam-continue"
              disabled={loading}
              onClick={() => rateCard(false)}
            >
              Hayır
            </button>
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              disabled={loading}
              onClick={() => rateCard(true)}
            >
              Evet
            </button>
          </div>
          </>
          ) : null}
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

      {stage === "result" && starsEarned > 0 ? (
        <p className="cp-stars-earned" role="status">
          <Star className="h-4 w-4" aria-hidden />+{starsEarned} yıldız
        </p>
      ) : null}

      {stage === "oral-review-time" ? (
        <OralReviewTimeDialog onSeeResults={() => setStage("result")} />
      ) : null}

      {stage === "result" && isOral ? (
        <OralResults
          topicLabel={oralTopicLabel}
          pct={oralPct}
          fullCount={oralReport?.fullCount}
          total={oralReport?.total ?? questions.length}
          minutesSpent={Math.max(
            1,
            Math.round((Date.now() - (playStartedAt ?? Date.now())) / 60000),
          )}
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
            setStage(signalStage);
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

      {stage === "result" && gainOpen && topicGain ? <TopicGainCard gain={topicGain} nextHref={nextHref} /> : null}

      {stage === "result" && !gainOpen && !isOral && !isTimedExam && payload.type !== "readiness" && payload.type !== "practice_empty" ? (
        <section
          className={cn(
            "cp-exam-node-result",
            `cp-exam-node-result--${resultMood(heroScore, heroTotal).tone}`,
          )}
        >
          {payload.type === "lesson" ? (
            <h1 className="cp-exam-result-title">{missingConcepts.length ? "Dersin hazır olan kısmı bu kadar" : "Dersin tamamı bu kadar"}</h1>
          ) : null}
          {/* Baştan yazıma rağmen hazırlanamayan bölüm sessizce eksik kalmaz (18 Ekim 2026). */}
          {payload.type === "lesson" && missingConcepts.length ? (
            <p className="cp-lesson-missing" role="status">
              Bu derste yer almayan bölüm: <strong>{missingConcepts.join(", ")}</strong>. &quot;Farklı anlat&quot; ile yeniden
              yazdırabilirsin.
            </p>
          ) : null}
          {/* Astra düzeni (30 Eylül 2026): büyük skor, emoji ve tek cümle,
              altında doğruluk ve süre satırları. */}
          {unscored ? (
            <>
              <p className="cp-lesson-kicker">Podcast</p>
              <p className="cp-result-mood">
                <span aria-hidden>🎧</span> Dinledin, konu kulağında.
              </p>
            </>
          ) : (
            <>
              <p className="cp-lesson-kicker">
                {payload.type === "cards" && cardSummary
                  ? "Bildiğin kartlar"
                  : payload.type === "podcast"
                    ? "Dinleme kontrolü"
                    : "Doğru cevaplar"}
              </p>
              <p
                className="cp-result-hero"
                aria-label={
                  payload.type === "cards" && cardSummary
                    ? `${heroTotal} karttan ${heroScore} biliniyor`
                    : `${heroTotal} sorudan ${heroScore} doğru`
                }
              >
                <strong>{heroScore}</strong>
                <span>/{heroTotal}</span>
              </p>
              <p className="cp-result-mood">
                <span aria-hidden>{resultMood(heroScore, heroTotal).emoji}</span>{" "}
                {resultMood(heroScore, heroTotal).text}
              </p>
            </>
          )}
          <dl className="cp-result-lines" aria-label="Oturum özeti">
            {unscored ? null : (
              <div>
                <dt>Doğruluk</dt>
                <dd>%{Math.round((heroScore / Math.max(1, heroTotal)) * 100)}</dd>
              </div>
            )}
            <div>
              <dt>Harcanan zaman</dt>
              <dd>
                {Math.max(
                  1,
                  Math.round((Date.now() - (playStartedAt ?? Date.now())) / 60000),
                )}{" "}
                dk
              </dd>
            </div>
          </dl>
          {payload.type === "cards" && cardSummary && repeatedCardsLine(cardSummary.repeated) ? (
            <p className="text-sm text-[var(--cp-muted)]">{repeatedCardsLine(cardSummary.repeated)}</p>
          ) : null}
          {score.retried > 0 ? (
            <p className="text-sm text-[var(--cp-muted)]">
              {score.retried === 1
                ? "1 soru ilk denemede yanlıştı. Tekrar ayrı durur ve bu sayıya eklenmez."
                : `${score.retried} soru ilk denemede yanlıştı. Tekrarlar ayrı durur ve bu sayıya eklenmez.`}
            </p>
          ) : null}
          {unscored ? null : (
            <p className="text-sm text-[var(--cp-muted)]">
              Bu oturum skoru program ilerlemesinden ve sınava hazırlık tahmininden ayrıdır.
            </p>
          )}
          {oralGrade?.items?.some((item) => !item.correct && item.gap) ? (
            <ul className="mt-2 space-y-1 text-sm">
              {oralGrade.items
                .filter((item) => !item.correct && item.gap)
                .map((item) => (
                  <li key={item.index}>
                    <span className="text-[var(--cp-muted)]">Eksik: </span>
                    {item.gap}
                  </li>
                ))}
            </ul>
          ) : null}
          {resumeEnabled && (score.retried > 0 || (score.total > 0 && score.score < score.total)) ? (
            <div className="cp-exam-retry-card">
              <p className="cp-exam-debrief-label">Tekrar edilecekler</p>
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
            </div>
          ) : null}
          {payload.type === "lesson" ? (
            <div className="pm-card cp-exam-self-test">
              <h2>Kendini test et</h2>
              <p>Bu dersi hızlı bir bilgi kontrolüyle tamamla.</p>
              <ExamFinishButton prepId={prepId} className="cp-exam-continue cp-exam-continue--primary" />
            </div>
          ) : null}
          <div className="cp-exam-node-actions">
            <button type="button" className="cp-exam-continue" onClick={() => {
              setStage("setup");
              setIndex(0);
              setAnswers({});
              setFeedback(null);
              setCardOffer(null);
              setCardRepeat(null);
              setCardSummary(null);
              setPodcastCheckOpen(false);
              // Ders aynı haliyle yeniden açılır (anında, kredisiz); öbür etkinlikler yeniden kurulur.
              if (kind === "lesson") void start({ replay: true });
            }}>
              {kind === "podcast" ? "Yeniden dinle" : "Dersi tekrarla"}
            </button>
            {kind === "lesson" ? (
              <button type="button" className="cp-exam-continue" onClick={() => {
                setStage("setup");
                setIndex(0);
                setAnswers({});
                setFeedback(null);
              }}>
                Farklı anlat
              </button>
            ) : null}
            {/* Podcast'te eğitmen notu yok: geri bildirim yalnız test ve doğru/yanlış cevaplarını okuyor
                (dinleme kontrolü cevaplansa da). */}
            {unscored || kind === "podcast" ? null : (
              <button
                type="button"
                className="cp-exam-continue"
                disabled={feedbackLoading}
                onClick={() => void loadFeedback()}
              >
                {feedbackLoading ? "Yazıyor…" : "Eğitmeninden geri bildirim"}
              </button>
            )}
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
          {pathChange ? (
            <p className="cp-path-change" role="status">
              {pathChangeLine(pathChange)}
            </p>
          ) : null}
          {reviewScheduledLine(reviewScheduled, kind) ? (
            <p className="cp-path-change" role="status">
              {reviewScheduledLine(reviewScheduled, kind)}
            </p>
          ) : null}
          {levelHint ? <LevelSuggestCard prepId={prepId} hint={levelHint} /> : null}
          {attemptId ? <LessonRatingCard attemptId={attemptId} /> : null}
          {/* Astra her dersin sonunda "arkadaşına meydan oku" diyor (1 Ekim
              2026). Düello sayfasına gider; kurmak öğrencinin kararı. */}
          <Link href={`/deneme-sinavlari/${prepId}/duello`} className="cp-exam-challenge">
            <Swords className="h-5 w-5 shrink-0" aria-hidden />
            <span>
              <strong>Arkadaşına meydan oku</strong>
              <em>Aynı konuda düello kur, bağlantıyı gönder. Arkadaşının hesap açması gerekmiyor.</em>
            </span>
          </Link>
          {topicGain ? (
            // Konu hâkimiyeti arttıysa önce "+%X kazandın" kartı, sonra sıradaki adım (Astra sırası).
            <button
              type="button"
              className="cp-exam-continue cp-exam-continue--primary"
              onClick={() => {
                setGainOpen(true);
                window.scrollTo({ top: 0 });
              }}
            >
              Devam et
            </button>
          ) : (
            <Link href={nextHref} className="cp-exam-continue cp-exam-continue--primary">
              {payload.type === "lesson" ? "Sıradaki adıma geç" : "Devam et"}
            </Link>
          )}
        </section>
      ) : null}

      {showCoach && coachItem ? (
        <ExamNodeCoach
          key={`${payload.type}-${index}`}
          prepId={prepId}
          nodeId={nodeId}
          itemText={coachItem}
          returnPath={`/deneme-sinavlari/${prepId}`}
          onUsed={markHint}
        />
      ) : null}

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message={paywallReason === "premium" ? "Sesli tekrar için hakkın yetmedi." : gateCopy.message}
        beyondFreeDaily={paywallReason !== "premium" && gateCopy.beyondFreeDaily}
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}

/** Kart destesinin üstündeki ilerleme çubuğu (Astra: çubuk + "1 / 10"). */
function CardProgress({ label, position, total }: { label: string | null; position: number; total: number }) {
  const pct = Math.round((Math.min(position, total) / Math.max(1, total)) * 100);
  return (
    <div className="cp-exam-card-progress">
      <span
        role="progressbar"
        aria-valuenow={position}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={label ? `${label} ilerlemesi` : "Kart ilerlemesi"}
      >
        <i style={{ width: `${pct}%` }} />
      </span>
      <em>
        {label ? `${label} · ` : ""}
        {position} / {total}
      </em>
    </div>
  );
}
